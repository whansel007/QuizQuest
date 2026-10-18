import { GAME_CONFIG } from '../game-config.js';

export class Hero {
  #lastDamageAt = Number.NEGATIVE_INFINITY;

  constructor({
    id,
    name,
    emoji,
    hp = GAME_CONFIG.heroDefaults.hp,
    attack = GAME_CONFIG.heroDefaults.attack,
    defense = GAME_CONFIG.heroDefaults.defense,
    speed = GAME_CONFIG.heroDefaults.speed,
    type = 'physical',
    weaponName = 'Weapon',
    skillName = 'Skill',
    ultimateName = 'Ultimate',
    talent = { name: 'Field Ready', description: 'Uses the hero’s standard combat skills.' },
    rarity = 'rare',
    weaponCooldownMs = GAME_CONFIG.combat.weaponCooldownMs,
    skillCooldownMs = GAME_CONFIG.combat.skillCooldownMs,
    ultimateCooldownMs = GAME_CONFIG.combat.ultimateCooldownMs,
    position = { x: 400, y: 250 },
    aim = { x: 1, y: 0 },
  } = {}) {
    // Identity
    this.id = id;
    this.name = name;
    this.emoji = emoji;
    this.visual = emoji; // swap this one field for sprite rendering later
    this.type = type;
    this.weaponName = weaponName;
    this.skillName = skillName;
    this.ultimateName = ultimateName;
    this.talent = talent;
    this.rarity = rarity;

    // Stats
    this.maxHp = hp;
    this.hp = hp;
    this.attack = attack;
    this.defense = defense;
    this.speed = speed;
    this.position = position;
    this.aim = aim;
    this.cooldowns = {
      weapon: { durationMs: weaponCooldownMs, readyAt: 0 },
      skill: { durationMs: skillCooldownMs, readyAt: 0 },
      ultimate: { durationMs: ultimateCooldownMs, readyAt: 0 },
    };
    this.invulnerableUntil = 0;
  }

  canUseAbility(name, now = Date.now()) {
    const ability = this.cooldowns[name];
    return !!ability && now >= ability.readyAt;
  }

  useAbility(name, now = Date.now(), durationMs = null) {
    const ability = this.cooldowns[name];
    if (!ability || !this.canUseAbility(name, now)) return false;
    ability.startedAt = now;
    ability.readyAt = now + (durationMs ?? ability.durationMs);
    if (name === 'ultimate') ability.cutThisCycleMs = 0;
    return true;
  }

  makeInvulnerable(durationMs, now = Date.now()) {
    this.invulnerableUntil = Math.max(this.invulnerableUntil, now + Math.max(0, durationMs));
  }

  damage(amount, now = Date.now()) {
    if (!Number.isFinite(amount) || amount <= 0 || this.hp <= 0) return 0;
    if (now < this.invulnerableUntil || now - this.#lastDamageAt < GAME_CONFIG.combat.damageIFrameMs) return 0;

    const previousHp = this.hp;
    const applied = Math.max(GAME_CONFIG.combat.minimumDamage, amount - this.defense);
    this.hp = Math.max(0, this.hp - applied);
    this.#lastDamageAt = now;
    return previousHp - this.hp;
  }

  heal(amount) {
    if (!Number.isFinite(amount) || amount <= 0 || this.hp <= 0) return 0;

    const previousHp = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    return this.hp - previousHp;
  }

  update() {
    return null;
  }
}

export default Hero;
