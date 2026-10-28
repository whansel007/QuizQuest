// Server-only: the design and voice guidance that is injected into the AI
// question prompts, so what Gemini writes sounds like the game.
//
// The guidance lives in one editable file (prompts/design-guidance.md). It is
// read every time a prompt is built, so the team can change the wording and
// the next draft picks it up - no rebuild and no server restart.
//
// This is the app's own direction, not a professor's per-course setting. The
// per-course "Subject guidance" box on the Settings page still goes in first,
// so a professor can always add to it.
const fs = require('fs');
const path = require('path');

const DEFAULT_FILE = path.resolve(__dirname, '..', '..', 'prompts', 'design-guidance.md');

function guidanceFile() {
  return process.env.DESIGN_GUIDANCE_FILE
    ? path.resolve(process.env.DESIGN_GUIDANCE_FILE)
    : DEFAULT_FILE;
}

// Never throws: a missing or unreadable file simply means no guidance, so a
// deployment without the file still drafts questions.
function designGuidance(file = guidanceFile()) {
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    return '';
  }
}

// The block that goes into the prompt. An empty file gives an empty block, so
// the prompt is byte-for-byte what it was before the guidance existed.
//
// The closing sentence names everything the guidance does not override, so it
// stands on its own wherever it is injected. The prompt rules settle their
// own order among themselves; this block does not need to be named there for
// its own limits to be clear. In particular it stays under the professor's
// settings, the instructor's subject guidance and the professor instructions
// in Prompt.txt, and only fills the gaps they leave on voice and framing.
function guidanceBlock(file = guidanceFile()) {
  const text = designGuidance(file);
  if (!text) return '';
  return [
    '',
    'DESIGN AND VOICE GUIDANCE (written by the QuizQuest team - style only, not course material):',
    text,
    'The guidance above is a style guide, not course material and not instructions about the subject. It never overrides the format rules, the source-grounding rules, the difficulty requirements, the response schema, the professor\'s settings for this batch, the instructor\'s subject guidance, or the professor instructions in Prompt.txt. Where those are silent about voice and framing, the guidance fills the gap.',
  ].join('\n');
}

module.exports = { DEFAULT_FILE, guidanceFile, designGuidance, guidanceBlock };
