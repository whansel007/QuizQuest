// One shared budget for every Gemini model/consumer in this server. Atomic
// reservations survive restarts; the existing application requires one server.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const pacific = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' });
const dayKey = (ms) => pacific.format(ms);
function nextDay(now) {
  const day = dayKey(now);
  let lo = now,
    hi = now + 27 * 3600000;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (dayKey(mid) === day) lo = mid;
    else hi = mid;
  }
  return hi;
}
const problem = (code, message, retryAt) => Object.assign(new Error(message), { code, status: 429, retryable: false, retryAt });
function createQuota({
  file = null,
  rpm = 15,
  tpm = 250000,
  rpd = 500,
  now = Date.now,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  maxWaitMs = 65000,
} = {}) {
  let state = file && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  if (state && (state.version !== 1 || !Array.isArray(state.events)))
    throw new Error('Gemini quota ledger is invalid. Restore it before making AI requests.');
  function current() {
    const day = dayKey(now());
    if (!state || state.day !== day) state = { version: 1, day, events: [], blockedUntil: 0 };
    return state;
  }
  let writes = Promise.resolve();
  function save() {
    if (!file) return Promise.resolve();
    const content = JSON.stringify(state);
    writes = writes
      .catch(() => {})
      .then(async () => {
        const temporary = file + '.' + randomUUID() + '.tmp';
        try {
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(temporary, content);
          for (let attempt = 0; ; attempt++) {
            try {
              await fs.promises.rename(temporary, file);
              break;
            } catch (e) {
              if (!['EPERM', 'EBUSY', 'EACCES'].includes(e.code) || attempt === 4) throw e;
              await new Promise((r) => setTimeout(r, 100 * 2 ** attempt));
            }
          }
        } catch (e) {
          throw Object.assign(new Error('AI quota tracking could not be saved. Check server storage before retrying.'), {
            code: 'QUOTA_STORAGE',
            retryable: false,
            cause: e,
          });
        }
      });
    return writes;
  }
  async function reserve({ tokens, model, operation = 'generateContent', context, onWait = async () => {}, waitBudgetMs = maxWaitMs }) {
    if (!Number.isFinite(tokens) || tokens < 0 || tokens > tpm)
      throw problem('TOKEN_LIMIT', 'This material is too long to process at once. Shorten the saved report or split the source files.');
    const start = now();
    for (;;) {
      const s = current(),
        time = now();
      if (s.dailyExhausted)
        throw problem(
          'DAILY_QUOTA',
          'The shared daily AI quota is exhausted. Your progress is saved; resume after the daily reset.',
          nextDay(time),
        );
      if (s.events.length >= rpd)
        throw problem(
          'DAILY_QUOTA',
          'The shared daily AI limit has been reached. Your work is saved; resume after the daily reset.',
          nextDay(time),
        );
      const recent = s.events.filter((e) => time - e.at < 60000);
      const used = recent.reduce((n, e) => n + e.reserved, 0);
      let wait = Math.max(0, s.blockedUntil - time);
      const last = s.events.at(-1);
      if (last) wait = Math.max(wait, last.at + Math.ceil(60000 / rpm) + 50 - time);
      if (recent.length >= rpm || used + tokens > tpm) wait = Math.max(wait, recent[0].at + 60050 - time);
      if (!wait) {
        const event = { id: randomUUID(), at: time, model, operation, reserved: Math.ceil(tokens), status: 'reserved' };
        if (context) event.context = { jobId: context.jobId, kind: context.kind, courseId: context.courseId, stage: context.stage, batch: context.batch };
        s.events.push(event);
        await save();
        return event.id;
      }
      if (wait > waitBudgetMs || now() - start + wait > waitBudgetMs)
        throw problem('QUOTA_WAIT', 'AI capacity is temporarily busy. Your work is saved; resume shortly.', time + wait);
      await onWait(time + wait);
      await sleep(Math.min(wait, 60000));
    }
  }
  async function finish(id, { usage, status } = {}) {
    const e = current().events.find((e) => e.id === id);
    if (!e) return;
    e.status = status || 'complete';
    if (usage) {
      e.usage = {
        promptTokens: usage.promptTokenCount || 0,
        outputTokens: usage.candidatesTokenCount || 0,
        thoughtTokens: usage.thoughtsTokenCount || 0,
        totalTokens: usage.totalTokenCount || 0,
      };
      if (Number.isInteger(usage.promptTokenCount)) e.reserved = e.usage.promptTokens;
    }
    await save();
  }
  async function block(until, daily = false) {
    const s = current();
    s.blockedUntil = Math.max(s.blockedUntil, until);
    s.dailyExhausted ||= daily;
    await save();
  }
  function snapshot() {
    return JSON.parse(JSON.stringify(current()));
  }
  return { reserve, finish, block, snapshot };
}
const instances = new Map();
function sharedQuota() {
  const file = path.resolve(process.env.GEMINI_USAGE_FILE || path.join('data', 'gemini-usage.json'));
  if (!instances.has(file)) {
    const limit = (name, max) => Math.max(1, Math.min(max, Number(process.env[name]) || max));
    instances.set(
      file,
      createQuota({ file, rpm: limit('GEMINI_RPM', 15), tpm: limit('GEMINI_TPM', 250000), rpd: limit('GEMINI_RPD', 500) }),
    );
  }
  return instances.get(file);
}
module.exports = { createQuota, sharedQuota, dayKey, nextDay };
