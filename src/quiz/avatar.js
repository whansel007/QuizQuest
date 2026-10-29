const { TOWN_AVATAR_DEFAULT_COLOR } = require('../../config/tuning');
const { AVATAR_COSMETIC_CATALOG, AVATAR_COSMETIC_BY_ID } = require('../../config/avatar-cosmetics');

function wardrobeState(user, inventory = null) {
  // New wardrobe state lives in inventories.extra, beside the resource
  // balances it spends. Keep reading the legacy users.extra value so existing
  // prototypes migrate without losing saved hats, ownership, or request IDs.
  const candidate = inventory?.avatarWardrobe || user.avatarWardrobe;
  const stored = candidate && typeof candidate === 'object' ? candidate : {};
  const ownedCosmetics = [...new Set((Array.isArray(stored.ownedIds) ? stored.ownedIds : []).filter((id) => {
    const item = AVATAR_COSMETIC_BY_ID[id];
    return (item?.slot === 'hat' || item?.slot === 'accessory') && item.active;
  }))];
  const ownedHats = ownedCosmetics.filter((id) => AVATAR_COSMETIC_BY_ID[id].slot === 'hat');
  const ownedAccessories = ownedCosmetics.filter((id) => AVATAR_COSMETIC_BY_ID[id].slot === 'accessory');
  const ownedIds = [...ownedCosmetics, ...AVATAR_COSMETIC_CATALOG.filter((item) => item.slot === 'color' && item.active).map((item) => item.id)];
  const hatId = AVATAR_COSMETIC_BY_ID[stored.hatId]?.slot === 'hat' && ownedHats.includes(stored.hatId) ? stored.hatId : null;
  const accessoryId = AVATAR_COSMETIC_BY_ID[stored.accessoryId]?.slot === 'accessory' && ownedAccessories.includes(stored.accessoryId) ? stored.accessoryId : null;
  return {
    ownedIds,
    ownedCosmetics,
    ownedHats,
    ownedAccessories,
    hatId,
    accessoryId,
    requests: stored.requests && typeof stored.requests === 'object' ? stored.requests : {},
  };
}

function legacyColorItem(user) {
  const color = typeof user.avatarColor === 'string' && /^#[0-9A-F]{6}$/i.test(user.avatarColor)
    ? user.avatarColor.toUpperCase() : null;
  if (!color || AVATAR_COSMETIC_CATALOG.some((item) => item.slot === 'color' && item.renderValue === color)) return null;
  return { id: 'color_legacy_' + color.slice(1).toLowerCase(), slot: 'color', name: 'Your saved color', description: 'Your existing avatar color is kept for free.', renderValue: color, currency: null, cost: 0, active: true, sortOrder: 0 };
}

function avatarVisual(user, inventory = null) {
  const wardrobe = wardrobeState(user, inventory);
  const color = typeof user.avatarColor === 'string' && /^#[0-9A-F]{6}$/i.test(user.avatarColor)
    ? user.avatarColor.toUpperCase() : TOWN_AVATAR_DEFAULT_COLOR;
  return { color, hat: wardrobe.hatId, accessory: wardrobe.accessoryId };
}

function wardrobeView(user, inventory = null) {
  const wardrobe = wardrobeState(user, inventory);
  const color = avatarVisual(user, inventory).color;
  const legacyColor = legacyColorItem(user);
  const colorId = AVATAR_COSMETIC_CATALOG.find((item) => item.slot === 'color' && item.renderValue === color)?.id || legacyColor?.id || null;
  return {
    catalog: [...AVATAR_COSMETIC_CATALOG, ...(legacyColor ? [legacyColor] : [])].map(({ id, slot, name, description, renderValue, currency, cost, active, sortOrder, anchor }) =>
      ({ id, slot, name, description, renderValue, currency, cost, active, sortOrder, ...(anchor ? { anchor } : {}) })),
    ownedIds: [...wardrobe.ownedIds, ...(legacyColor ? [legacyColor.id] : [])],
    equipped: { hatId: wardrobe.hatId, accessoryId: wardrobe.accessoryId, colorId },
    avatarVisual: avatarVisual(user, inventory),
  };
}

module.exports = { wardrobeState, wardrobeView, avatarVisual, legacyColorItem };
