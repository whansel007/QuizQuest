// Shared look of each pet rarity: the egg colour that drops from the
// machine (null = a random pastel) and the prize box colours.
export const PASTELS = ['#ff8fab', '#7dd3fc', '#fde047', '#86efac', '#c4b5fd', '#fdba74'];
export const RARITY = {
  starter: { egg: null, confetti: 40 },
  common: { egg: null, confetti: 40 },
  rare: { egg: '#4f8df7', confetti: 80 },
  epic: { egg: '#f5b829', confetti: 140 },
};
export const eggColour = (rarity) => RARITY[rarity]?.egg || PASTELS[Math.floor(Math.random() * PASTELS.length)];
