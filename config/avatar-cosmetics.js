const { TOWN_AVATAR_ORIGINAL_COLOR, TOWN_AVATAR_PRESET_COLORS } = require('./tuning');

const hats = [
  { id: 'hat_ribbon', name: 'Storybook ribbon', description: 'A bright ribbon for a new adventure.', renderValue: '🎀', sortOrder: 1 },
  { id: 'hat_top_hat', name: 'Traveling top hat', description: 'A little formality for the road.', renderValue: '🎩', currency: 'wood', cost: 8, sortOrder: 2 },
  { id: 'hat_crown', name: 'Little crown', description: 'A royal touch for your kingdom.', renderValue: '👑', currency: 'crystal', cost: 3, sortOrder: 3 },
  { id: 'hat_cowboy', name: 'Trailblazer hat', description: 'Ready for the long trail.', renderValue: '🤠', currency: 'herb', cost: 6, sortOrder: 4 },
].map((item) => Object.freeze({ ...item, slot: 'hat', currency: item.currency || null, cost: item.cost || 0, active: true }));

const accessories = [
  { id: 'accessory_star_pin', name: 'Star pin', description: 'A little badge for a bright idea.', renderValue: '⭐', anchor: 'badge', sortOrder: 1 },
  { id: 'accessory_leaf_pin', name: 'Leaf pin', description: 'A reminder of the garden path.', renderValue: '🍃', anchor: 'badge', currency: 'herb', cost: 3, sortOrder: 2 },
  { id: 'accessory_heart_pin', name: 'Heart pin', description: 'A keepsake from a favorite friend.', renderValue: '💛', anchor: 'badge', currency: 'crystal', cost: 2, sortOrder: 3 },
].map((item) => Object.freeze({ ...item, slot: 'accessory', currency: item.currency || null, cost: item.cost || 0, active: true }));

const colors = [...new Set([TOWN_AVATAR_ORIGINAL_COLOR, ...TOWN_AVATAR_PRESET_COLORS])]
  .map((renderValue, index) => Object.freeze({
    id: 'color_' + renderValue.slice(1).toLowerCase(),
    slot: 'color',
    name: renderValue === TOWN_AVATAR_ORIGINAL_COLOR ? 'Original sprite color' : 'Color ' + renderValue,
    description: 'A free color for your town avatar.',
    renderValue, currency: null, cost: 0, active: true, sortOrder: index + 1,
  }));

const AVATAR_COSMETIC_CATALOG = Object.freeze([...hats, ...accessories, ...colors]);
const AVATAR_COSMETIC_BY_ID = Object.freeze(Object.assign(Object.create(null), Object.fromEntries(AVATAR_COSMETIC_CATALOG.map((item) => [item.id, item]))));

module.exports = { AVATAR_COSMETIC_CATALOG, AVATAR_COSMETIC_BY_ID };
