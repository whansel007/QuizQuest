export const HERO_TYPE_ICON = Object.freeze({
  physical: '✦',
  magic: '🌀',
});

export function heroTypeLabel(type) {
  const label = String(type || '').toLowerCase();
  return label ? `${label[0].toUpperCase()}${label.slice(1)}` : 'Unknown';
}

export function formatHeroType(type) {
  const label = String(type || '').toLowerCase();
  const icon = HERO_TYPE_ICON[label];
  const name = heroTypeLabel(type);
  return icon ? `${icon} ${name}` : name;
}
