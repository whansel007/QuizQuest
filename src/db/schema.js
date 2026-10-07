// ============================================================
// In-memory collections <-> Supabase tables
// ------------------------------------------------------------
// The app's domain code works on one `db` object of arrays (db.users,
// db.questions...). This file describes how each collection maps onto
// the tables in supabase/migrations: which field goes to which column,
// which fields are timestamps (ms in the app, timestamptz in Postgres),
// and which nested arrays become child tables (topic outcomes, question
// versions and reports).
//
// Any field not listed is kept in the row's `extra` jsonb column, so a
// new field added by the app is saved even before it gets a column.
// ============================================================

// field -> column (snake_case), with options per field:
//   ts: ms timestamp <-> timestamptz
//   keepNull: the app sets this field to null on purpose; restore null
//             (other null columns come back as "field not set")
const f = (column, opts = {}) => ({ column, ...opts });

const TABLES = [
  {
    table: 'users', collection: 'users', key: ['id'],
    fields: { id: f('id'), name: f('name'), role: f('role') },
  },
  {
    table: 'courses', collection: 'courses', key: ['id'],
    fields: { id: f('id'), title: f('title'), teacherIds: f('teacher_ids'), coverageTarget: f('coverage_target'), promptConfig: f('prompt_config') },
  },
  {
    table: 'topics', collection: 'topics', key: ['id'],
    fields: { id: f('id'), courseId: f('course_id'), name: f('name') },
    children: { outcomes: 'learning_outcomes' },
  },
  {
    table: 'learning_outcomes', parent: { table: 'topics', field: 'outcomes', column: 'topic_id' }, key: ['id'], order: 'position',
    fields: { id: f('id'), text: f('text') },
  },
  {
    table: 'classes', collection: 'classes', key: ['id'],
    fields: { id: f('id'), courseId: f('course_id'), name: f('name'), teacherIds: f('teacher_ids'), settings: f('settings') },
  },
  {
    table: 'enrolments', collection: 'enrolments', key: ['class_id', 'student_id'],
    fields: { classId: f('class_id'), studentId: f('student_id') },
  },
  {
    table: 'passages', collection: 'passages', key: ['id'],
    fields: { id: f('id'), courseId: f('course_id'), topicId: f('topic_id'), outcomeId: f('outcome_id'), title: f('title'), text: f('text'), origin: f('origin'), createdBy: f('created_by'), createdAt: f('created_at', { ts: true }) },
  },
  {
    table: 'generation_log', collection: 'generationLog', key: ['id'],
    fields: {
      id: f('id'), courseId: f('course_id'), topicId: f('topic_id'), outcomeId: f('outcome_id'), count: f('count'), format: f('format'), focus: f('focus'),
      passageIds: f('passage_ids'), chunkCount: f('chunk_count'), provider: f('provider'), model: f('model', { keepNull: true }), calls: f('calls'), hash: f('hash'),
      at: f('at', { ts: true }), by: f('created_by'), ok: f('ok'), error: f('error'), createdQuestionIds: f('created_question_ids'), rejected: f('rejected'),
      rawOutput: f('raw_output', { keepNull: true }),
    },
  },
  {
    table: 'questions', collection: 'questions', key: ['id'],
    fields: {
      id: f('id'), courseId: f('course_id'), topicId: f('topic_id'), outcomeId: f('outcome_id'), status: f('status'), origin: f('origin'),
      generationId: f('generation_id', { keepNull: true }), createdAt: f('created_at', { ts: true }), createdBy: f('created_by'),
      publishedVersion: f('published_version', { keepNull: true }), editCount: f('edit_count'), prepSeconds: f('prep_seconds'),
      reviewedAt: f('reviewed_at', { ts: true, keepNull: true }), reviewedBy: f('reviewed_by', { keepNull: true }),
    },
    children: { versions: 'question_versions', reports: 'question_reports' },
  },
  {
    table: 'question_versions', parent: { table: 'questions', field: 'versions', column: 'question_id' }, key: ['question_id', 'v'], order: 'v',
    fields: {
      v: f('v'), type: f('type'), stem: f('stem'), difficulty: f('difficulty'), explanation: f('explanation'), sourceIds: f('source_ids'),
      editedAt: f('edited_at', { ts: true }), editedBy: f('edited_by'), publishedAt: f('published_at', { ts: true, keepNull: true }),
    },
  },
  {
    table: 'question_reports', parent: { table: 'questions', field: 'reports', column: 'question_id' }, key: ['id'], order: 'position',
    fields: { id: f('id'), studentId: f('student_id'), reason: f('reason'), at: f('at', { ts: true }), resolved: f('resolved'), resolvedAt: f('resolved_at', { ts: true }) },
  },
  {
    table: 'sessions', collection: 'sessions', key: ['id'],
    fields: {
      id: f('id'), studentId: f('student_id'), classId: f('class_id'), courseId: f('course_id'), createdAt: f('created_at', { ts: true }),
      completedAt: f('completed_at', { ts: true, keepNull: true }), timerSec: f('timer_sec'), mode: f('mode'), cursor: f('cursor'), coins: f('coins'),
      plan: f('plan'), items: f('items'), npc: f('npc'), endRewards: f('end_rewards'), feedback: f('feedback'),
    },
  },
  {
    table: 'attempts', collection: 'attempts', key: ['id'],
    fields: {
      id: f('id'), sessionId: f('session_id', { keepNull: true }), studentId: f('student_id'), classId: f('class_id'), courseId: f('course_id'),
      questionId: f('question_id'), version: f('version'), topicId: f('topic_id'), type: f('type'), correct: f('correct'), score: f('score'),
      ms: f('ms'), timedOut: f('timed_out'), first: f('first'), context: f('context'), at: f('at', { ts: true }), needsReview: f('needs_review'),
      markedBy: f('marked_by'), markedAt: f('marked_at', { ts: true }),
    },
  },
  {
    table: 'ledger', collection: 'ledger', key: ['id'],
    fields: { id: f('id'), studentId: f('student_id'), kind: f('kind'), amount: f('amount'), reason: f('reason'), refKey: f('ref_key'), at: f('at', { ts: true }), meta: f('meta') },
  },
  {
    table: 'inventories', collection: 'inventory', key: ['student_id'],
    fields: { studentId: f('student_id'), pets: f('pets'), items: f('items'), equippedPet: f('equipped_pet'), equippedItem: f('equipped_item', { keepNull: true }), resources: f('resources') },
  },
  {
    table: 'kingdoms', collection: 'kingdoms', key: ['student_id'],
    fields: { studentId: f('student_id'), buildings: f('buildings') },
  },
  {
    table: 'trades', collection: 'trades', key: ['id'],
    fields: {
      id: f('id'), classId: f('class_id'), fromId: f('from_id'), give: f('give'), want: f('want'), status: f('status'), createdAt: f('created_at', { ts: true }),
      acceptedBy: f('accepted_by'), acceptedAt: f('accepted_at', { ts: true }), closedAt: f('closed_at', { ts: true }),
    },
  },
  {
    table: 'resource_log', collection: 'resourceLog', key: ['id'],
    fields: { id: f('id'), studentId: f('student_id'), kind: f('kind'), delta: f('delta'), reason: f('reason'), refKey: f('ref_key'), at: f('at', { ts: true }) },
  },
  {
    table: 'participation', collection: 'participation', key: ['id'],
    fields: { id: f('id'), studentId: f('student_id'), classId: f('class_id'), sessionId: f('session_id'), week: f('week'), at: f('at', { ts: true }) },
  },
];
// TABLES is in foreign-key order: parents are written before children
// (and deleted after them).

const byName = Object.fromEntries(TABLES.map((t) => [t.table, t]));
const keyOf = (spec, row) => spec.key.map((k) => row[k]).join('\u0001');

// Postgres text and jsonb cannot hold NUL characters (they can arrive in
// pasted PDF text). Strip them on the way out so one bad character can't
// block every later save.
function clean(v) {
  if (typeof v === 'string') return v.includes('\u0000') ? v.replace(/\u0000/g, '') : v;
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, clean(x)]));
  return v;
}

const toTs = (ms) => (ms === null || ms === undefined ? null : new Date(ms).toISOString());
const fromTs = (v) => (v === null || v === undefined ? null : Date.parse(v));

function toRow(spec, obj) {
  const row = {};
  for (const [field, def] of Object.entries(spec.fields)) {
    const v = obj[field];
    row[def.column] = def.ts ? toTs(v) : v === undefined ? null : clean(v);
  }
  const extra = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!Object.hasOwn(spec.fields, k) && !(spec.children && Object.hasOwn(spec.children, k)) && v !== undefined) extra[k] = clean(v);
  }
  row.extra = Object.keys(extra).length ? extra : null;
  return row;
}

function fromRow(spec, row) {
  const obj = {};
  for (const [field, def] of Object.entries(spec.fields)) {
    let v = row[def.column];
    if (def.ts) v = fromTs(v);
    if (v === null || v === undefined) {
      if (def.keepNull) obj[field] = null;
    } else obj[field] = v;
  }
  return Object.assign(obj, row.extra || {});
}

// db object -> { table: rows[] }. seqOf(table, obj) gives each top-level
// object its stable creation-order number.
function toTables(db, seqOf) {
  const out = {};
  for (const spec of TABLES) out[spec.table] = [];
  for (const spec of TABLES) {
    if (spec.parent) continue;
    for (const obj of db[spec.collection]) {
      out[spec.table].push({ ...toRow(spec, obj), seq: seqOf(spec.table, obj) });
      for (const [field, childTable] of Object.entries(spec.children || {})) {
        const child = byName[childTable];
        (obj[field] || []).forEach((c, i) => {
          const row = { ...toRow(child, c), [child.parent.column]: obj.id };
          if (child.order === 'position') row.position = i;
          out[childTable].push(row);
        });
      }
    }
  }
  return out;
}

// { table: rows[] } (each sorted by seq / position / v) -> db object.
// onObject(table, obj, row) lets the store remember each object's seq.
function fromTables(tables, onObject = () => {}) {
  const db = {};
  const parents = {};
  for (const spec of TABLES) {
    if (spec.parent) continue;
    db[spec.collection] = (tables[spec.table] || []).map((row) => {
      const obj = fromRow(spec, row);
      for (const field of Object.keys(spec.children || {})) obj[field] = [];
      onObject(spec.table, obj, row);
      return obj;
    });
    if (spec.children) parents[spec.table] = new Map(db[spec.collection].map((o) => [o.id, o]));
  }
  for (const spec of TABLES) {
    if (!spec.parent) continue;
    for (const row of tables[spec.table] || []) {
      const parent = parents[spec.parent.table].get(row[spec.parent.column]);
      if (parent) parent[spec.parent.field].push(fromRow(spec, row));
    }
  }
  return db;
}

// How to read each table back in a stable order
const orderOf = (spec) => (spec.parent ? [spec.parent.column, spec.order] : ['seq']);

module.exports = { TABLES, byName, keyOf, toRow, fromRow, toTables, fromTables, orderOf };
