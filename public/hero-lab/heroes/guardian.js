import { Hero } from '../bases/hero.js';
import { GAME_CONFIG } from '../game-config.js';
import { setup, shot } from './shared.js';

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

export const guardian = new Guardian();
export default guardian;
