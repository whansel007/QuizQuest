import { Hero } from '../bases/hero.js';
import { Projectile } from '../bases/projectile.js';
import { GAME_CONFIG } from '../game-config.js';
import { setup } from './shared.js';

export class Engineer extends Hero {
  constructor() {
    super(setup('engineer', 'Engineer', '🔧', 'physical'));
    this.spec = GAME_CONFIG.heroes.engineer;
    this.weaponName = 'Wrench Boomerang';
    this.skillName = 'Deploy Turret';
    this.ultimateName = 'Overclock Laser';
    this.wrenchInFlight = false;
  }

  fire() {
    if (this.wrenchInFlight) return null;
    const spec = this.spec.wrench;
    const projectile = new Projectile({
      x: this.position.x, y: this.position.y,
      vx: this.aim.x * spec.speed, vy: this.aim.y * spec.speed,
      speed: spec.speed, radius: spec.radius, damage: this.attack * spec.damageMultiplier,
      lifetimeMs: spec.maxMs, shape: 'wrench', emoji: '🔧', rotateToAim: true,
      color: GAME_CONFIG.heroFxColors.engineer.primary, sourceAbility: 'weapon',
    });
    projectile.engineerWrench = true;
    projectile.wrenchLeg = 'outbound';
    projectile.wrenchDistance = 0;
    this.wrenchInFlight = true;
    return projectile;
  }

  skill() { return { type: 'engineer-turret' }; }
  ultimate() { return { type: 'engineer-laser' }; }
}

export const engineer = new Engineer();
export default engineer;
