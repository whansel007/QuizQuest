import { Hero } from '../bases/hero.js';
import { GAME_CONFIG } from '../game-config.js';
import { setup, shot } from './shared.js';

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

export const pilot = new Pilot();
export default pilot;
