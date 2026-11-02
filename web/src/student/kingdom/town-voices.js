// ============================================================
// Kingdom town voices: short, family-friendly lines for the heroes
// who wander the town, plus the emote wheel's choices. Heroes are
// gender-neutral cat-ball creatures; keep lines brief and in voice.
// ============================================================

export const HERO_LINES = {
  guardian: {
    ambient: ['Anybody wants to learn Rollate? :D', 'Man I love rolling on grass ~', 'They see me rolling ~'],
    greet: ['Greetings! Do not worry, my rolls are unstopable! >:D', 'Hark! A perfectly soft patch of grass! One must roll on it >:D'],
  },
  sheriff: {
    ambient: ['Trail\'s clear to the north... or is that south?', 'All quiet in town today.... too quiet..', 'What do cowboys say? Moooo?'],
    greet: ['Howdy, partner! I checked the trail twice. Should be safe (probably...)', 'This town ain\'t big enough for the 2 of us... just kidding ;V'],
  },
  pilot: {
    ambient: ['Robot check: all bolts tight!', 'Maybe the engineer has some upgrade ideas...', 'Did anybody see my mech charger cable? I lost it! T_T'],
    greet: ['Hey! Want to see me turn into a robot? Later, promise! ;D', 'Running a quick systems check. All neon green! ;D'],
  },
  bombardier: {
    ambient: ['Arr, I smell treasure!', 'Yo-ho, what a fine breeze.', 'X marks the spot... somewhere...'],
    greet: ['Ahoy, matey! Found any treasure today? ;D', 'Arr! A fine day for an EXPLOSIVE adventure! ;3'],
  },
  bubbles: {
    ambient: ['Wanna play tag? :D', 'Bubbles! Bubbles everywhere! ^_^', 'Hehe, catch me! catch me! :3'],
    greet: ['Hi hi! Wanna play with me? :3', 'You\'re it! Just kidding. Let\'s play! :3'],
  },
  electromancer: {
    ambient: ['Ouch, a tiny spark!', 'Maybe I should just quit my job and be full mage...', 'UNLIMITED POWER!!!!'],
    greet: ['Go read the magic thunder book in the library! It\'s shocking! ;D', 'Hello! Do you want to lightning in a bottle? ;V'],
  },
  fairy: {
    ambient: ['They were a fairy ~', 'That wind you just felt? You\'re welcome', 'Maybe I should just '],
    greet: ['Greetings! I do wind magic! So unless your wish is a tornado, too bad :p', 'Stop trying to exchange teeth for money. I\'m not that kind of fairy :/'],
  },
  engineer: {
    ambient: ['Loose bolt? Uh... guess that\'s an extra', 'A turret broke? Oh no... Anyway :V', 'Has anyone seen a random screw somewhere? Don\'t eat it! I need it!'],
    greet: ['Hi! Want to see what I can build? Me too! :D', 'Honestly, if doesn\'t instanly explode, it is already a success XD'],
  },
  samurai: {
    ambient: ['お前はもう死んでいる!', 'I am the chosen one! Trust me >:D', 'Watching anime makes you smarter! Believe it!'],
    greet: ['こんにちは! My blade can cut through 1000 enemies >:D', 'I have the power of anime by my side >:D'],
  },
  ranger: {
    ambient: ['Always pack an extra hot dog.', 'Friendship starts with great food :3', 'Awoooooooooo! It means hello :D'],
    greet: ['Hi there! Have you met my best friend? They\'re somewhere in the forest...', 'As long as we have meat, the wolf and I have your back! :D'],
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
