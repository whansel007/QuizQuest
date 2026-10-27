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
- Keep stems short and scannable. One idea per question.

## What this must never do

- Never change what is being tested, how hard it is, or whether an answer is
  correct. The flavour sits on top of the academic content, never in place of
  it.
- Never replace a scenario the source material supports with a storybook one.
  If the material gives a worked case, use that case.
- Never use the game world to smuggle in a fact that is not in the source
  material.
