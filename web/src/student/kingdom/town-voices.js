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
    ambient: ['Wanna play tag? :D', 'Bubbles! Bubbles everywhere! ^_^', 'Hehe, catch me! catch me!'],
    greet: ['Hi hi! Wanna play with me? :3', 'You\'re it! Just kidding. Let\'s play! :3'],
  },
  electromancer: {
    ambient: ['Ouch, a tiny spark!', 'Maybe I should just quit my job and be full mage...', 'I wonder if I should start an power company...'],
    greet: ['Have you read the magic thunder book in the library? It\'s shocking! ;D', 'Hello! Do you want to lightning in a bottle? Too bad... Even I don\'t know how to do that :V'],
  },
  fairy: {
    ambient: ['They were a fairy ~', 'That wind you just felt? You\'re welcome', 'Maybe I should just '],
    greet: ['Greetings! I do wind magic! So unless your wish is a tornado, too bad :p', 'Please stop trying to exchange teeth for money.. I am not that kind of fairy :/'],
  },
  engineer: {
    ambient: ['Loose bolt? Uh... guess that\'s an extra', 'A turret broke? Oh no... Anyway :V', 'Has anyone seen a random screw somewhere? Don\'t eat it! I need it!'],
    greet: ['Hi! Want to see what I can build with these spare parts?', 'Honestly, if turret doesn\'t instantly explode, it is already a success XD'],
  },
  samurai: {
    ambient: ['Practice makes a plastic blade pretty impressive.', 'One more drill. Then another.', 'Please do not look too closely at the price sticker.'],
    greet: ['Hello! The sword is plastic. The practice is very real.', 'No formal training, just a lot of practice. Want to see?'],
  },
  ranger: {
    ambient: ['Always pack an extra hot dog.', 'My best friend has four paws and a great nose.', 'The trail is quiet. The wolf is listening.'],
    greet: ['Hi there! Have you met my best friend? They\'re somewhere in the forest...', 'The wolf and I have your back provided I have some meat to give them :V'],
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
