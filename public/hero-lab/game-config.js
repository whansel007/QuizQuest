// One place for values that shape combat and game feel. Hero definitions may
// override the defaults, while the server remains the authority for timing.
export const GAME_CONFIG = Object.freeze({
  arena: { width: 1920, height: 1080, playerRadius: 24, tickHz: 30 },
  heroDefaults: { hp: 100, attack: 10, defense: 5, speed: 220 },
  combat: {
    minimumDamage: 1,
    damageIFrameMs: 1000,
    weaponCooldownMs: 500,
    skillCooldownMs: 5000,
    ultimateCooldownMs: 30000,
    projectileMaxAgeMs: 3500,
  },
  campfire: { hp: 100, radius: 28 },
  waves: { enemySpawnIntervalMs: 700, breakMs: 5000, baseEnemies: 5, linearGrowth: 2, quadraticGrowth: 1, devilEveryEnemies: 5 },
  spawns: [
    { x: 480, y: 540 },
    { x: 1440, y: 540 },
    { x: 960, y: 270 },
    { x: 960, y: 810 },
  ],
  enemySpawnMargin: 35,
  weaponMuzzleOffset: 24,
  enemies: {
    zombie: { hp: 20, speed: 55, radius: 16, damage: 6 },
    devil: { hp: 35, speed: 95, radius: 18, damage: 12, attackCooldownMs: 1000 },
  },
  projectiles: {
    fireball: { radius: 10, color: '#ff2d20', speed: 550, damage: 10 },
    enemyBullet: { radius: 8, color: '#ed3d4d', speed: 260, damage: 8 },
  },
  hud: { physical: '#48a8ff', magic: '#b17cff' },
  heroes: {
    flamekeeper: { type: 'magic', hp: 100, attack: 14, defense: 5, speed: 220, weaponCooldownMs: 1000, skillCooldownMs: 5000, ultimateCooldownMs: 30000, ultimateDamageMultiplier: 3, dashDistance: 180 },
    ranger: { type: 'physical', hp: 85, attack: 18, defense: 3, speed: 260 },
    guardian: { type: 'physical', hp: 130, attack: 10, defense: 9, speed: 180 },
  },
});
