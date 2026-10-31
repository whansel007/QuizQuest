const { TOWN_AVATAR_ORIGINAL_COLOR, TOWN_AVATAR_PRESET_COLORS } = require('./tuning');
const { hats: hatData, accessories: accessoryData } = require('./avatar-cosmetics-data.json');

const hats = hatData.map((item) => Object.freeze({ ...item, slot: 'hat', currency: item.currency || null, cost: item.cost || 0, active: true }));

const accessories = accessoryData.map((item) => Object.freeze({ ...item, slot: 'accessory', currency: item.currency || null, cost: item.cost || 0, active: true }));

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
