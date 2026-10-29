// Browser-safe render data for the town canvas. The authoritative catalog and
// ownership rules live in config/avatar-cosmetics.js on the server; the canvas
// only needs the fixed hat and badge glyphs to draw an equipped avatar.
export const AVATAR_COSMETIC_BY_ID = Object.freeze({
  hat_ribbon: Object.freeze({ id: 'hat_ribbon', slot: 'hat', renderValue: '🎀' }),
  hat_top_hat: Object.freeze({ id: 'hat_top_hat', slot: 'hat', renderValue: '🎩' }),
  hat_crown: Object.freeze({ id: 'hat_crown', slot: 'hat', renderValue: '👑' }),
  hat_cowboy: Object.freeze({ id: 'hat_cowboy', slot: 'hat', renderValue: '🤠' }),
  accessory_star_pin: Object.freeze({ id: 'accessory_star_pin', slot: 'accessory', renderValue: '⭐', anchor: 'badge' }),
  accessory_leaf_pin: Object.freeze({ id: 'accessory_leaf_pin', slot: 'accessory', renderValue: '🍃', anchor: 'badge' }),
  accessory_heart_pin: Object.freeze({ id: 'accessory_heart_pin', slot: 'accessory', renderValue: '💛', anchor: 'badge' }),
});
