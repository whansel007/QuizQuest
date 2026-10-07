-- ============================================================
-- QuizQuest schema for Supabase Postgres
-- ------------------------------------------------------------
-- One table per collection the app keeps (see src/db/schema.js for the
-- field <-> column mapping). Nested data that only makes sense as a
-- whole (a session's question list, a class's settings, a question
-- version's format-specific fields) is jsonb. Each table has an `extra`
-- jsonb column for fields not (yet) promoted to their own column, so
-- nothing the app stores is lost.
--
-- `seq` keeps the order the app created rows in (several views show
-- "the latest N"), since timestamps can tie.
--
-- SECURITY: row level security is ON for every table with NO policies.
-- That means the browser-facing keys (publishable / anon) can read and
-- write nothing. Only the Node server, using the secret key from its
-- environment, can reach this data. Add policies only when a feature
-- deliberately lets the browser talk to Supabase directly (e.g. with
-- Supabase Auth), and never expose answer keys (question_versions) or
-- other students' rows to students.
--
-- All demo data is synthetic. Do not load real student data.
-- ============================================================

create table app_meta (
  key text primary key,
  value jsonb not null
);

create table users (
  id text primary key,
  seq bigint not null,
  name text not null,
  role text not null check (role in ('teacher', 'student')),
  extra jsonb
);

create table courses (
  id text primary key,
  seq bigint not null,
  title text not null,
  teacher_ids text[] not null default '{}',
  coverage_target integer,
  prompt_config text,
  extra jsonb
);

create table topics (
  id text primary key,
  seq bigint not null,
  course_id text not null references courses (id),
  name text not null,
  extra jsonb
);

create table learning_outcomes (
  id text primary key,
  topic_id text not null references topics (id),
  position integer not null,
  text text not null,
  extra jsonb
);

create table classes (
  id text primary key,
  seq bigint not null,
  course_id text not null references courses (id),
  name text not null,
  teacher_ids text[] not null default '{}',
  settings jsonb not null default '{}',
  extra jsonb
);

create table enrolments (
  class_id text not null references classes (id),
  student_id text not null references users (id),
  seq bigint not null,
  extra jsonb,
  primary key (class_id, student_id)
);

create table passages (
  id text primary key,
  seq bigint not null,
  course_id text not null references courses (id),
  topic_id text,
  outcome_id text,
  title text not null,
  text text not null,
  origin text,
  created_by text references users (id),
  created_at timestamptz,
  extra jsonb
);

create table generation_log (
  id text primary key,
  seq bigint not null,
  course_id text not null references courses (id),
  topic_id text,
  outcome_id text,
  count integer,
  format text,
  focus text,
  passage_ids text[],
  chunk_count integer,
  provider text,
  model text,
  calls integer,
  hash text,
  at timestamptz,
  created_by text references users (id),
  ok boolean,
  error text,
  created_question_ids text[],
  rejected jsonb,
  raw_output text,
  extra jsonb
);

create table questions (
  id text primary key,
  seq bigint not null,
  course_id text not null references courses (id),
  topic_id text,
  outcome_id text,
  status text not null check (status in ('draft', 'published', 'rejected', 'withdrawn')),
  origin text,
  generation_id text references generation_log (id),
  created_at timestamptz,
  created_by text references users (id),
  published_version integer,
  edit_count integer,
  prep_seconds integer,
  reviewed_at timestamptz,
  reviewed_by text references users (id),
  extra jsonb
);

-- Every version a student may have seen is kept, so old attempts stay
-- interpretable. Format-specific fields (options, answer keys, tolerance,
-- maths template...) live in `extra`. These are ANSWER KEYS: never
-- readable by students.
create table question_versions (
  question_id text not null references questions (id),
  v integer not null,
  type text,
  stem text,
  difficulty text,
  explanation text,
  source_ids text[],
  edited_at timestamptz,
  edited_by text,
  published_at timestamptz,
  extra jsonb,
  primary key (question_id, v)
);

-- Student reports on a question. Shown to professors WITHOUT the reporter.
create table question_reports (
  id text primary key,
  question_id text not null references questions (id),
  position integer not null,
  student_id text references users (id),
  reason text,
  at timestamptz,
  resolved boolean not null default false,
  resolved_at timestamptz,
  extra jsonb
);

create table sessions (
  id text primary key,
  seq bigint not null,
  student_id text not null references users (id),
  class_id text not null references classes (id),
  course_id text references courses (id),
  created_at timestamptz,
  completed_at timestamptz,
  timer_sec integer,
  mode text,
  cursor integer,
  coins integer,
  plan jsonb,
  items jsonb not null default '[]',
  npc jsonb,
  end_rewards jsonb,
  feedback jsonb,
  extra jsonb
);

create table attempts (
  id text primary key,
  seq bigint not null,
  session_id text references sessions (id),
  student_id text not null references users (id),
  class_id text not null references classes (id),
  course_id text references courses (id),
  question_id text not null references questions (id),
  version integer,
  topic_id text,
  type text,
  correct boolean,
  score double precision,
  ms bigint,
  timed_out boolean,
  first boolean,
  context text,
  at timestamptz,
  needs_review boolean,
  marked_by text references users (id),
  marked_at timestamptz,
  extra jsonb
);

-- Coin ledger. ref_key is unique: the same reward or purchase can never
-- be recorded twice, whichever server instance handles the request.
create table ledger (
  id text primary key,
  seq bigint not null,
  student_id text not null references users (id),
  kind text not null,
  amount integer not null,
  reason text,
  ref_key text not null unique,
  at timestamptz,
  meta jsonb,
  extra jsonb
);

create table inventories (
  student_id text primary key references users (id),
  seq bigint not null,
  pets jsonb not null default '[]',
  items jsonb not null default '[]',
  equipped_pet text,
  equipped_item text,
  resources jsonb,
  extra jsonb
);

create table kingdoms (
  student_id text primary key references users (id),
  seq bigint not null,
  buildings jsonb not null default '{}',
  extra jsonb
);

create table trades (
  id text primary key,
  seq bigint not null,
  class_id text not null references classes (id),
  from_id text not null references users (id),
  give jsonb not null,
  want jsonb not null,
  status text not null check (status in ('open', 'accepted', 'cancelled')),
  created_at timestamptz,
  accepted_by text references users (id),
  accepted_at timestamptz,
  closed_at timestamptz,
  extra jsonb
);

-- Resource ledger (wood/crystal/herb). Same unique ref_key rule as coins.
create table resource_log (
  id text primary key,
  seq bigint not null,
  student_id text not null references users (id),
  kind text not null,
  delta jsonb not null,
  reason text,
  ref_key text not null unique,
  at timestamptz,
  extra jsonb
);

create table participation (
  id text primary key,
  seq bigint not null,
  student_id text not null references users (id),
  class_id text not null references classes (id),
  session_id text unique references sessions (id),
  week date,
  at timestamptz,
  extra jsonb
);

-- Indexes for the lookups the per-request (long-term) design will need
create index on topics (course_id);
create index on learning_outcomes (topic_id);
create index on classes (course_id);
create index on enrolments (student_id);
create index on passages (course_id);
create index on generation_log (course_id);
create index on questions (course_id, status);
create index on question_reports (question_id);
create index on sessions (student_id, class_id);
create index on attempts (student_id, class_id);
create index on attempts (class_id);
create index on attempts (question_id);
create index on ledger (student_id);
create index on trades (class_id, status);
create index on resource_log (student_id);
create index on participation (class_id);

-- Row level security: on everywhere, no policies (see header)
alter table app_meta enable row level security;
alter table users enable row level security;
alter table courses enable row level security;
alter table topics enable row level security;
alter table learning_outcomes enable row level security;
alter table classes enable row level security;
alter table enrolments enable row level security;
alter table passages enable row level security;
alter table generation_log enable row level security;
alter table questions enable row level security;
alter table question_versions enable row level security;
alter table question_reports enable row level security;
alter table sessions enable row level security;
alter table attempts enable row level security;
alter table ledger enable row level security;
alter table inventories enable row level security;
alter table kingdoms enable row level security;
alter table trades enable row level security;
alter table resource_log enable row level security;
alter table participation enable row level security;
