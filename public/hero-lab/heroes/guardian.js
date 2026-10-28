import { Hero } from '../bases/hero.js';
import { GAME_CONFIG } from '../game-config.js';
import { setup, shot } from './shared.js';

export class Guardian extends Hero {
  constructor() {
    super(setup('guardian', 'Guardian', '🛡️', 'physical'));
    this.spec = GAME_CONFIG.heroes.guardian; this.weaponName = 'Shield Bash'; this.skillName = 'Shield Rush'; this.ultimateName = 'Unbreakable Charge';
    this.chargeUntil = 0; this.lastChargeHit = new Map(); this.dashingUntil = 0; this.dashStartedAt = 0; this.dashCapUntil = 0;
    // Set by the room when Shield Rush is cast: the end of its i-frame window.
    // The client keeps the sprite solid for it instead of blinking.
    this.rushIFrameUntil = 0;
  }
  fire() { return shot(this, { ...this.spec.shield, damage: this.attack * this.spec.shield.damageMultiplier }); }
  skill(now = Date.now()) {
    const s = this.spec.skillDash;
    const aim = this.aim;
    const length = Math.hypot(aim.x, aim.y);
    const dir = length > 1e-4 ? { x: aim.x / length, y: aim.y / length } : { x: 1, y: 0 };
    return {
      type: 'dash',
      direction: dir,
      distance: s.distance,
      durationMs: s.durationMs,
      invulnerableMs: s.invulnerableMs,
      fanDirection: dir,
      fan: s.fan,
    };
  }
  ultimate(now) {
    this.chargeUntil = now + this.spec.charge.durationMs; this.dashingUntil = this.chargeUntil; this.dashStartedAt = now;
    this.dashCapUntil = now + this.spec.charge.durationMs * GAME_CONFIG.arenaTuning.heroTweaks.guardianDashMaxBaseMultiplier;
    this.lastChargeHit.clear();
    this.makeInvulnerable(this.spec.charge.invulnerabilityMs, now);
    return { type: 'activate' };
  }
}

export const guardian = new Guardian();
export default guardian;
