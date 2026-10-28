// ============================================================
// Kingdom town voices: short, family-friendly lines for the heroes
// who wander the town, plus the emote wheel's choices. Heroes are
// gender-neutral cat-ball creatures; keep lines brief and in voice.
// ============================================================

export const HERO_LINES = {
  guardian: {
    ambient: ['I\'ll keep watch by the gate.', 'Shield polished. Town safe.', 'Nobody sneaks past this shield!'],
    greet: ['Hello, friend! I\'ll stand guard while you explore.', 'Need a shield to lean on? I\'m right here.'],
  },
  sheriff: {
    ambient: ['Trail\'s clear to the north.', 'All quiet in town today.', 'Keepin\' an eye on things.'],
    greet: ['Howdy, partner! I checked the trail twice. It\'s safe.', 'Welcome back! No trouble in town today.'],
  },
  pilot: {
    ambient: ['Robot check: all bolts tight!', 'Flight test after lunch!', 'Mech suit… powering up. Soon!'],
    greet: ['Hey! Want to see me turn into a robot? Later, promise!', 'Running a quick systems check. All green!'],
  },
  bombardier: {
    ambient: ['Arr, I smell treasure!', 'Yo-ho, what a fine breeze.', 'X marks the spot… somewhere.'],
    greet: ['Ahoy, matey! Found any treasure today?', 'Arr! A fine day for an adventure!'],
  },
  bubbles: {
    ambient: ['Wanna play tag?', 'Bubbles! Bubbles everywhere!', 'Hehe, catch me!'],
    greet: ['Hi hi! Wanna play with me?', 'You\'re it! Just kidding. Let\'s play!'],
  },
  electromancer: {
    ambient: ['Ooh, a tiny spark!', 'A storm is brewing… a small one.', 'Zzzap! Oops, sorry.'],
    greet: ['Careful, my whiskers are a bit staticky today.', 'Hello! Did you feel that tiny spark?'],
  },
};

const FALLBACK = {
  ambient: ['What a lovely day in town.', 'Off for a little stroll.'],
  greet: ['Hello! Nice to see you in town.'],
};

export function heroLine(heroId, kind, previous = '') {
  const lines = (HERO_LINES[heroId] || FALLBACK)[kind] || FALLBACK[kind];
  const choices = lines.length > 1 ? lines.filter((line) => line !== previous) : lines;
  return choices[Math.floor(Math.random() * choices.length)];
}

export const EMOTES = Object.freeze([
  { id: 'thumbs-up', glyph: '👍', label: 'Thumbs up' },
  { id: 'thumbs-down', glyph: '👎', label: 'Thumbs down' },
  { id: 'wave', glyph: '👋', label: 'Wave' },
  { id: 'heart', glyph: '❤️', label: 'Heart' },
  { id: 'laugh', glyph: '😄', label: 'Laugh' },
  { id: 'question', glyph: '❓', label: 'Question' },
]);
