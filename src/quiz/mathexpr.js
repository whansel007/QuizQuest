// ============================================================
// Safe maths expressions for parameterised questions
// ------------------------------------------------------------
// Professors (or Gemini) write formulas like "(a + b + c) / 3" or
// constraints like "a != b && c > 0". We NEVER eval() them: this file
// is a tiny parser that only understands numbers, named variables,
// arithmetic, comparisons and a short whitelist of functions.
// Anything else is a syntax error.
// ============================================================

const FUNCS = {
  sqrt: Math.sqrt, abs: Math.abs, floor: Math.floor, ceil: Math.ceil,
  min: Math.min, max: Math.max, pow: Math.pow, exp: Math.exp,
  ln: Math.log, log: Math.log10,
  round: (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d,
};
const CONSTS = { pi: Math.PI, e: Math.E };
const MAX_LEN = 300;
const MAX_DEPTH = 40;

function tokenize(src) {
  const re = /\s*(\d+(?:\.\d+)?|[A-Za-z_]\w*|<=|>=|==|!=|&&|\|\||[-+*/%^(),<>])/y;
  const out = [];
  let pos = 0;
  while (pos < src.length) {
    re.lastIndex = pos;
    const m = re.exec(src);
    if (!m) {
      if (/^\s*$/.test(src.slice(pos))) break;
      throw new SyntaxError(`Unexpected "${src.slice(pos).trim()[0]}"`);
    }
    out.push(m[1]);
    pos = re.lastIndex;
  }
  return out;
}

function parse(src) {
  if (typeof src !== 'string' || !src.trim()) throw new SyntaxError('Empty expression');
  if (src.length > MAX_LEN) throw new SyntaxError('Expression too long');
  const t = tokenize(src);
  let i = 0;
  let depth = 0;
  const peek = () => t[i];
  const eat = (tok) => {
    if (t[i] !== tok) throw new SyntaxError(`Expected "${tok}"${t[i] ? ` but found "${t[i]}"` : ''}`);
    i++;
  };
  // Count real nesting (brackets, unary minus chains, powers), not the
  // number of terms: depth goes up on entry and back down on exit.
  const nested = (fn) => () => {
    if (++depth > MAX_DEPTH) throw new SyntaxError('Expression nested too deeply');
    try {
      return fn();
    } finally {
      depth--;
    }
  };

  const binary = (next, ops) => () => {
    let left = next();
    while (ops.includes(peek())) {
      const op = t[i++];
      left = { op, a: left, b: next() };
    }
    return left;
  };
  const unary = nested(() => {
    if (peek() === '-' || peek() === '+') {
      const op = t[i++];
      return { op: 'neg' + op, a: unary() };
    }
    return power();
  });
  const power = () => {
    const base = atom();
    if (peek() === '^') {
      i++;
      return { op: '^', a: base, b: unary() }; // right associative
    }
    return base;
  };
  const mul = binary(unary, ['*', '/', '%']);
  const add = binary(mul, ['+', '-']);
  const cmp = () => {
    const left = add();
    if (['<', '<=', '>', '>=', '==', '!='].includes(peek())) {
      const op = t[i++];
      return { op, a: left, b: add() };
    }
    return left;
  };
  const and = binary(cmp, ['&&']);
  const or = binary(and, ['||']);
  const atom = nested(atomInner);
  function atomInner() {
    const tok = t[i++];
    if (tok === undefined) throw new SyntaxError('Unexpected end of expression');
    if (/^\d/.test(tok)) return { num: Number(tok) };
    if (tok === '(') {
      const e = or();
      eat(')');
      return e;
    }
    if (/^[A-Za-z_]/.test(tok)) {
      // Object.hasOwn, not `in`/FUNCS[tok]: names like "constructor" or
      // "toString" must not resolve to inherited Object.prototype members
      if (peek() === '(') {
        if (!Object.hasOwn(FUNCS, tok)) throw new SyntaxError(`Unknown function "${tok}"`);
        i++;
        const args = [];
        if (peek() !== ')') {
          args.push(or());
          while (peek() === ',') {
            i++;
            args.push(or());
          }
        }
        eat(')');
        return { fn: tok, args };
      }
      if (Object.hasOwn(CONSTS, tok)) return { num: CONSTS[tok] };
      return { v: tok };
    }
    throw new SyntaxError(`Unexpected "${tok}"`);
  }

  const ast = or();
  if (i < t.length) throw new SyntaxError(`Unexpected "${t[i]}"`);
  return ast;
}

function evaluate(node, scope) {
  if ('num' in node) return node.num;
  if ('v' in node) {
    if (!Object.hasOwn(scope, node.v)) throw new ReferenceError(`Unknown variable "${node.v}"`);
    return scope[node.v];
  }
  if (node.fn) return FUNCS[node.fn](...node.args.map((a) => evaluate(a, scope)));
  const a = evaluate(node.a, scope);
  if (node.op === 'neg-') return -a;
  if (node.op === 'neg+') return +a;
  const b = evaluate(node.b, scope);
  switch (node.op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return a / b;
    case '%': return a % b;
    case '^': return a ** b;
    case '<': return a < b;
    case '<=': return a <= b;
    case '>': return a > b;
    case '>=': return a >= b;
    case '==': return Math.abs(a - b) < 1e-9;
    case '!=': return Math.abs(a - b) >= 1e-9;
    case '&&': return Boolean(a && b);
    case '||': return Boolean(a || b);
  }
  throw new Error('bad node');
}

// Variable names an expression refers to (for "is every variable defined?")
function variables(node, out = new Set()) {
  if ('v' in node) out.add(node.v);
  if (node.a) variables(node.a, out);
  if (node.b) variables(node.b, out);
  if (node.args) node.args.forEach((x) => variables(x, out));
  return out;
}

module.exports = { parse, evaluate, variables, FUNCS };
