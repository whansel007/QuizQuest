import { Hero } from '../bases/hero.js';
import { Projectile } from '../bases/projectile.js';
import { GAME_CONFIG } from '../game-config.js';

const muzzle = GAME_CONFIG.weaponMuzzleOffset;
const shot = (hero, spec, extra = {}) => new Projectile({
  x: hero.position.x + hero.aim.x * muzzle,
  y: hero.position.y + hero.aim.y * muzzle,
  aim: hero.aim,
  damage: hero.attack,
  sourceAbility: 'weapon',
  ...spec,
  color: GAME_CONFIG.heroFxColors[hero.id]?.primary || spec.color,
  flashColors: [GAME_CONFIG.heroFxColors[hero.id]?.primary, GAME_CONFIG.heroFxColors[hero.id]?.highlight],
  ...extra,
});
const setup = (id, name, emoji, type) => {
  const c = GAME_CONFIG.heroes[id];
  return { id, name, emoji, type, rarity: GAME_CONFIG.heroSummon.rarities[id], ...c, weaponCooldownMs: c.weaponCooldownMs,
    skillCooldownMs: c.skillCooldownMs, ultimateCooldownMs: c.ultimateCooldownMs };
};

export class Sheriff extends Hero {
  constructor() {
    super(setup('sheriff', 'Sheriff', '🤠', 'physical'));
    this.spec = GAME_CONFIG.heroes.sheriff; this.weaponName = 'Revolver'; this.skillName = 'Dynamite'; this.ultimateName = 'Deadeye';
    this.barrageUntil = 0; this.barrageAt = 0;
  }
  fire() {
    const range = Math.hypot(GAME_CONFIG.arena.width, GAME_CONFIG.arena.height) / 2 * GAME_CONFIG.arenaTuning.heroTweaks.sheriffBulletRangeArenaDiagonalFraction;
    return shot(this, { ...this.spec.bullet, damage: this.attack, lifetimeMs: range / this.spec.bullet.speed * 1000,
      fadeLastFraction: GAME_CONFIG.arenaTuning.heroTweaks.sheriffBulletFadeFraction });
  }
  skill() {
    const s = this.spec.dynamite;
    return { type: 'projectile', projectile: shot(this, { ...s, sourceAbility: 'skill', damage: this.attack * s.damageMultiplier, explosionRadius: s.explosionRadius, detonateOnExpire: true }) };
  }
  ultimate(now) { this.barrageUntil = now + this.spec.barrage.durationMs; this.barrageAt = now; return { type: 'activate' }; }
  update(now, primaryHeld = false) {
    if (!primaryHeld || now >= this.barrageUntil || now < this.barrageAt) return null;
    this.barrageAt = now + this.spec.barrage.intervalMs;
    // Position and aim are refreshed by the server every tick during Deadeye.
    const range = Math.hypot(GAME_CONFIG.arena.width, GAME_CONFIG.arena.height) / 2 * GAME_CONFIG.arenaTuning.heroTweaks.sheriffBulletRangeArenaDiagonalFraction;
    return shot(this, { ...this.spec.bullet, radius: this.spec.barrage.bulletRadius, sourceAbility: 'ultimate', damage: this.attack,
      lifetimeMs: range / this.spec.bullet.speed * 1000, fadeLastFraction: GAME_CONFIG.arenaTuning.heroTweaks.sheriffBulletFadeFraction });
  }
}

export class Guardian extends Hero {
  constructor() {
    super(setup('guardian', 'Guardian', '🛡️', 'physical'));
    this.spec = GAME_CONFIG.heroes.guardian; this.weaponName = 'Shield Bash'; this.skillName = 'Shield Rush'; this.ultimateName = 'Unbreakable Charge';
    this.chargeUntil = 0; this.lastChargeHit = new Map(); this.dashingUntil = 0; this.dashStartedAt = 0; this.dashCapUntil = 0;
  }
  fire() { return shot(this, { ...this.spec.shield, damage: this.attack * this.spec.shield.damageMultiplier }); }
  skill(now = Date.now()) {
    const s = this.spec.skillDash;
    return { type: 'controlled_burst', ...s };
  }
  ultimate(now) {
    this.chargeUntil = now + this.spec.charge.durationMs; this.dashingUntil = this.chargeUntil; this.dashStartedAt = now;
    this.dashCapUntil = now + this.spec.charge.durationMs * GAME_CONFIG.arenaTuning.heroTweaks.guardianDashMaxBaseMultiplier;
    this.lastChargeHit.clear();
    this.makeInvulnerable(this.spec.charge.invulnerabilityMs, now);
    return { type: 'activate' };
  }
}

export class Pilot extends Hero {
  constructor() {
    super(setup('pilot', 'Pilot', '🧑‍✈️', 'physical'));
    this.spec = GAME_CONFIG.heroes.pilot; this.weaponName = 'Scattershot'; this.skillName = 'Dash'; this.ultimateName = 'Mech Suit'; this.mechUntil = 0;
  }
  refreshForm(now) {
    const mech = this.mechUntil > now, c = this.spec.mech;
    const bonus = (stat) => (this.buildingBonuses?.[stat] || 0) + (this.runBonuses?.[stat] || 0);
    this.visual = mech ? '🤖' : this.emoji; this.weaponName = mech ? c.weaponName : 'Scattershot'; this.skillName = mech ? c.skillName : 'Dash';
    this.attack = (mech ? c.attack : this.spec.attack) + bonus('attack');
    this.defense = (mech ? c.defense : this.spec.defense) + bonus('defense');
    this.speed = (mech ? c.speed : this.spec.speed) + bonus('speed');
    this.maxHp = (mech ? c.hp : this.spec.hp) + bonus('maxHp'); this.hp = Math.min(this.hp, this.maxHp);
    this.cooldowns.weapon.durationMs = mech ? c.weaponCooldownMs : this.spec.weaponCooldownMs;
    this.cooldowns.skill.durationMs = mech ? c.skillCooldownMs : this.spec.skillCooldownMs;
    if (mech) this.makeInvulnerable(this.mechUntil - now, now);
  }
  fire() {
    if (this.mechUntil > Date.now()) {
      const s = this.spec.mech.punch;
      return shot(this, { ...s, emoji: '🤜', rotateToAim: true, sourceAbility: 'weapon', damage: this.attack * s.damageMultiplier, explosionRadius: s.explosionRadius });
    }
    const s = this.spec.shotgun, center = Math.atan2(this.aim.y, this.aim.x);
    return Array.from({ length: s.pellets }, () => {
      const angle = center + (Math.random() - .5) * s.spreadRadians;
      return shot(this, { speed: s.speed || 570, vx: Math.cos(angle) * (s.speed || 570), vy: Math.sin(angle) * (s.speed || 570),
        radius: s.radius, color: s.color, lifetimeMs: s.range / (s.speed || 570) * 1000, damage: this.attack * s.pelletDamageMultiplier });
    });
  }
  skill(now = Date.now()) {
    const mech = this.mechUntil > now, s = mech ? this.spec.mech.dash : this.spec.retreatDash;
    return { type: 'dash', direction: { ...this.aim }, ...s };
  }
  ultimate(now) { this.mechUntil = now + this.spec.mech.durationMs; this.refreshForm(now); return { type: 'activate' }; }
  update(now) { this.refreshForm(now); }
}

export class Bombardier extends Hero {
  constructor() {
    super(setup('bombardier', 'Bombardier', '💣', 'magic'));
    this.spec = GAME_CONFIG.heroes.bombardier; this.weaponName = 'Blast Bomb'; this.skillName = 'Proximity Trap'; this.ultimateName = 'Targeted Bombing'; this.targetingUntil = 0;
  }
  fire() { const s = this.spec.bomb; return shot(this, { ...s, damage: this.attack * s.damageMultiplier, explosionRadius: s.explosionRadius, detonateOnExpire: true, emoji: '💣', sourceAbility: 'weapon' }); }
  skill() { const s = this.spec.trap; return { type: 'trap', ...s, x: this.position.x, y: this.position.y, damage: this.attack * s.damageMultiplier }; }
  ultimate(now) { this.targetingUntil = now + this.spec.airstrike.targetTimeoutMs; return { type: 'targeting' }; }
}

export class Bubbles extends Hero {
  constructor() {
    super(setup('bubbles', 'Bubbles', '🫧', 'magic'));
    this.spec = GAME_CONFIG.heroes.bubbles; this.weaponName = 'Bubble Spray'; this.skillName = 'Bubble Trap'; this.ultimateName = 'Bubble Rush';
  }
  fire() {
    const s = this.spec.spray, angle = Math.atan2(this.aim.y, this.aim.x) + (Math.random() - .5) * s.spreadRadians;
    return shot(this, { ...s, vx: Math.cos(angle) * s.speed, vy: Math.sin(angle) * s.speed, lifetimeMs: s.range / s.speed * 1000, damage: this.attack * s.damageMultiplier });
  }
  skill() {
    const s = this.spec.bubbleTrap;
    return shot(this, { speed: s.speed, radius: s.radius, lifetimeMs: s.travelDistance / s.speed * 1000, emoji: '🫧', damage: 0,
      sourceAbility: 'skill', trap: s });
  }
  ultimate() { const s = this.spec.ultimate; return { type: 'bubble_rush', ...s, damage: this.attack * s.damageMultiplier }; }
}

export class Electromancer extends Hero {
  constructor() {
    super(setup('electromancer', 'Electromancer', '⚡', 'magic'));
    this.spec = GAME_CONFIG.heroes.electromancer; this.weaponName = 'Lightning Orb'; this.skillName = 'Stun Field'; this.ultimateName = 'Chain Lightning';
  }
  fire() { const s = this.spec.ball; return shot(this, { ...s, damage: this.attack, pierces: s.pierces }); }
  skill() { const s = this.spec.stunBall; return shot(this, { ...s, sourceAbility: 'skill', damage: this.attack * s.damageMultiplier, stunMs: s.stunMs, explosionRadius: s.areaRadius }); }
  ultimate() { const s = this.spec.chain; return { type: 'chain', ...s, damage: this.attack * s.damageMultiplier, x: this.position.x, y: this.position.y }; }
}

export const sheriff = new Sheriff(); export const guardian = new Guardian(); export const pilot = new Pilot();
export const bombardier = new Bombardier(); export const bubbles = new Bubbles(); export const electromancer = new Electromancer();
