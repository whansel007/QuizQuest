import { Hero } from '../bases/hero.js';
import { Fireball } from '../projectiles/fireball.js';

export class Flamekeeper extends Hero {
  constructor() {
    super({
      id: 'flamekeeper',
      name: 'Flamekeeper',
      emoji: '🧙',
      hp: 100,
      attack: 14,
      defense: 5,
      speed: 220,
    });
    this.weaponName = 'Ember Staff';
    this.skillName = 'Firebolt';
    this.skillDescription = 'a quick burst of fire in the aimed direction.';
    this.ultimateName = 'Meteor Storm';
    this.ultimateDescription = 'a large area attack around the aimed point.';
    this.primaryCooldownMs = 1000;
    this.primaryReadyAt = 0;
    this.ultimateEndsAt = 0;
    this.nextUltimateShotAt = 0;
    this.ultimateDurationMs = 5000;
    this.ultimateFireIntervalMs = 500;
    this.dashDistance = 180;
  }

  fire(mode = 'primary', now = Date.now()) {
    this.endUltimateIfExpired(now);
    if (mode !== 'primary') return null;
    if (now < this.primaryReadyAt) return null;

    this.primaryReadyAt = now + this.primaryCooldownMs;
    return new Fireball({
      x: this.position.x + this.aim.x * 24,
      y: this.position.y + this.aim.y * 24,
      aim: this.aim,
    });
  }

  skill() {
    return { type: 'dash', direction: { ...this.aim }, distance: this.dashDistance };
  }

  ultimate(now = Date.now()) {
    this.endUltimateIfExpired(now);
    if (now < this.ultimateEndsAt) return false;
    this.primaryCooldownMs = 0;
    this.primaryReadyAt = now;
    this.ultimateEndsAt = now + this.ultimateDurationMs;
    this.nextUltimateShotAt = now + this.ultimateFireIntervalMs;
    return true;
  }

  update(now = Date.now()) {
    this.endUltimateIfExpired(now);

    if (now < this.ultimateEndsAt && now >= this.nextUltimateShotAt) {
      this.nextUltimateShotAt = now + this.ultimateFireIntervalMs;
      return this.fire('primary', now);
    }
    return null;
  }

  endUltimateIfExpired(now) {
    if (!this.ultimateEndsAt || now < this.ultimateEndsAt) return;
    this.ultimateEndsAt = 0;
    this.primaryCooldownMs = 1000;
    this.primaryReadyAt = now + this.primaryCooldownMs;
  }
}

export const flamekeeper = new Flamekeeper();
export default flamekeeper;
