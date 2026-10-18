import { Hero } from '../bases/hero.js';
import { Projectile } from '../bases/projectile.js';
import { GAME_CONFIG } from '../game-config.js';

const muzzle = GAME_CONFIG.weaponMuzzleOffset;
const shot = (hero, spec, extra = {}) => new Projectile({
  x: hero.position.x + hero.aim.x * muzzle,
  y: hero.position.y + hero.aim.y * muzzle,
  aim: hero.aim,
  damage: hero.attack,
  ...spec,
  ...extra,
});
const setup = (id, name, emoji, type) => {
  const c = GAME_CONFIG.heroes[id];
  return { id, name, emoji, type, ...c,
    weaponCooldownMs: c.weaponCooldownMs, skillCooldownMs: c.skillCooldownMs,
    ultimateCooldownMs: c.ultimateCooldownMs };
};

export class Sheriff extends Hero {
  constructor() { super({ ...setup('sheriff', 'Sheriff', '🤠', 'physical') }); this.spec = GAME_CONFIG.heroes.sheriff; this.weaponName='Revolver'; this.skillName='Dynamite'; this.ultimateName='Deadeye'; this.barrageUntil=0; this.barrageAt=0; }
  fire() { return shot(this, { ...this.spec.bullet, damage:this.attack, color:'#f4cc50' }); }
  skill() { return { type:'projectile', projectile:shot(this,{ ...this.spec.dynamite, damage:this.attack*this.spec.dynamite.damageMultiplier, color:'#ff8c32', explosionRadius:this.spec.dynamite.explosionRadius, detonateOnExpire:true }) }; }
  ultimate(now) { this.barrageUntil=now+this.spec.barrage.durationMs; this.barrageAt=now; return { type:'activate' }; }
  update(now) { if(now>=this.barrageUntil) return null; if(now<this.barrageAt) return null; this.barrageAt=now+this.spec.barrage.intervalMs; return shot(this,{ ...this.spec.bullet, damage:this.attack, color:'#f4cc50' }); }
}

export class Guardian extends Hero {
  constructor() { super({ ...setup('guardian','Guardian','🛡️','physical') }); this.spec=GAME_CONFIG.heroes.guardian; this.weaponName='Shield Toss'; this.skillName='Shield Rush'; this.ultimateName='Unbreakable Charge'; this.chargeUntil=0; this.lastChargeHit=new Map(); }
  fire() { return shot(this,{ ...this.spec.shield, damage:this.attack*this.spec.shield.damageMultiplier, color:'#71c7ff' }); }
  skill() { return { type:'dash', direction:{...this.aim}, ...this.spec.skillDash }; }
  ultimate(now) { this.chargeUntil=now+this.spec.charge.durationMs; this.makeInvulnerable(this.spec.charge.invulnerabilityMs,now); return {type:'activate'}; }
}

export class Pilot extends Hero {
  constructor() { super({ ...setup('pilot','Pilot','🧑‍✈️','physical') }); this.spec=GAME_CONFIG.heroes.pilot; this.weaponName='Pulse Blaster'; this.skillName='Retreat'; this.ultimateName='Mech Suit'; this.mechUntil=0; }
  get inMech() { return this.mechUntil>Date.now(); }
  refreshForm(now) {
    const mech=this.mechUntil>now, c=this.spec.mech;
    this.visual=mech?'🤖':this.emoji; this.weaponName=mech?c.weaponName:'Pulse Blaster'; this.skillName=mech?c.skillName:'Retreat';
    this.attack=mech?c.attack:this.spec.attack; this.defense=mech?c.defense:this.spec.defense; this.speed=mech?c.speed:this.spec.speed;
    this.maxHp=mech?c.hp:this.spec.hp; this.hp=Math.min(this.hp,this.maxHp);
    this.cooldowns.weapon.durationMs=mech?c.weaponCooldownMs:this.spec.weaponCooldownMs;
    this.cooldowns.skill.durationMs=mech?c.skillCooldownMs:this.spec.skillCooldownMs;
  }
  fire() { const mech=this.mechUntil>Date.now(); return shot(this,mech?{...this.spec.mech.punch,damage:this.attack*this.spec.mech.punch.damageMultiplier,color:'#ffb347'}:{...this.spec.baseShot,damage:this.attack*this.spec.baseShot.damageMultiplier,color:'#8ee7ff'}); }
  skill() { return {type:'dash',direction:{...this.aim},...(this.mechUntil>Date.now()?this.spec.mech.dash:{distance:this.spec.retreatDash.distance})}; }
  ultimate(now) { this.mechUntil=now+this.spec.mech.durationMs; this.refreshForm(now); return {type:'activate'}; }
  update(now) { this.refreshForm(now); }
}

export class Bombardier extends Hero {
  constructor() { super({ ...setup('bombardier','Bombardier','💣','magic') }); this.spec=GAME_CONFIG.heroes.bombardier; this.weaponName='Blast Bomb'; this.skillName='Trap'; this.ultimateName='Airstrike'; }
  fire() { const b=this.spec.bomb; return shot(this,{...b,damage:this.attack*b.damageMultiplier,color:'#ff6b35',explosionRadius:b.explosionRadius,detonateOnExpire:true}); }
  skill() { return {type:'trap',...this.spec.trap, x:this.position.x, y:this.position.y, damage:this.attack*this.spec.trap.damageMultiplier}; }
  ultimate() { return {type:'airstrike',...this.spec.airstrike,damage:this.attack*this.spec.airstrike.damageMultiplier}; }
}

export class Bubbles extends Hero {
  constructor() { super({ ...setup('bubbles','Bubbles','🫧','magic') }); this.spec=GAME_CONFIG.heroes.bubbles; this.weaponName='Bubble Pop'; this.skillName='Healing Mode'; this.ultimateName='Tidal Bubble'; this.healingUntil=0; }
  fire() { const healing=this.healingUntil>Date.now(), b=this.spec.bubble; return shot(this,{...b,damage:healing?0:this.attack*b.damageMultiplier,heal:healing?b.heal:0,targetTeam:healing?'players':'monsters',color:healing?'#74efff':'#ef9fff'}); }
  skill(now=Date.now()) { this.healingUntil=now+this.spec.healingModeMs; this.weaponName='Healing Bubbles'; return {type:'activate'}; }
  ultimate() { return {type:'bubble',x:this.position.x,y:this.position.y,...this.spec.ultimate,damage:this.attack*this.spec.ultimate.damageMultiplier}; }
  update(now) { if(now>=this.healingUntil) this.weaponName='Bubble Pop'; }
}

export class Electromancer extends Hero {
  constructor() { super({ ...setup('electromancer','Electromancer','⚡','magic') }); this.spec=GAME_CONFIG.heroes.electromancer; this.weaponName='Lightning Orb'; this.skillName='Stun Field'; this.ultimateName='Chain Lightning'; }
  fire() { return shot(this,{...this.spec.ball,damage:this.attack,color:'#ffe45c',pierces:this.spec.ball.pierces}); }
  skill() { return shot(this,{...this.spec.stunBall,damage:this.attack*this.spec.stunBall.damageMultiplier,color:'#65d9ff',stunMs:this.spec.stunBall.stunMs, explosionRadius:this.spec.stunBall.areaRadius}); }
  ultimate() { return {type:'chain',...this.spec.chain,damage:this.attack*this.spec.chain.damageMultiplier,x:this.position.x,y:this.position.y}; }
}

export const sheriff=new Sheriff(); export const guardian=new Guardian(); export const pilot=new Pilot();
export const bombardier=new Bombardier(); export const bubbles=new Bubbles(); export const electromancer=new Electromancer();
