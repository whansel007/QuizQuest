# QuizQuest design and voice guidance

This file is injected into the AI question prompts, so the questions Gemini
writes sound like the game rather than like a worksheet.

It is read **every time a prompt is built**, so you can edit this text and the
next draft picks it up — no rebuild, no server restart, no code change.

Keep this file about **voice and framing**. The technical rules (source
grounding, difficulty, question format, the answer key) are enforced in the
server and in the prompt itself, so do not restate or weaken them here.

Derived from `BRANDBOOK.md` (the QuizQuest brand book) — sections 1 and 9.

---

## Voice

- Warm, curious and encouraging. The student is an adventurer learning around a
  campfire, not a candidate sitting an exam.
- Short, active wording: "Choose an adventurer", "Host a lobby", "Keep the
  campfire burning". Never "Candidates are required to select…".
- Plain and encouraging — never babyish, never sarcastic, never corporate.
- No guilt, no fake urgency, no pressure to continue playing or spend points.

## Framing

- Where a scenario helps, set it in the game world: the forest clearing, the
  campfire, the guild hall, a party of adventurers. Use it as a light frame for
  the real academic work.
- Name things the way the game does — adventurer, campfire, the clearing, the
  guild — but keep the subject vocabulary exact. The world is the setting, not
  the topic.
- Keep the frame to one short clause, such as "The guild's scribe runs this
  test:". Never shorten, hide or rename the givens to make room for it.
- For code, data and calculations, the game world only says who is doing the
  task. The code, numbers and results stay exactly as the subject needs them.
- Use a quest or character only when it carries the givens the question needs.
  If it adds nothing, leave it out: a plain, clear question is better than a
  decorated one.
- Keep wording scannable, and assess one skill per question. A hard question
  may still need several givens or steps.

## What this must never do

- Never change what is being tested, how hard it is, or whether an answer is
  correct. The flavour sits on top of the academic content, never in place of
  it.
- Never replace a scenario the source material supports with a storybook one.
  Preserve its academic meaning, but create a distinct assessment task rather
  than copying the worked case or its sample question.
- Never use the game world to smuggle in a fact that is not in the source
  material.
