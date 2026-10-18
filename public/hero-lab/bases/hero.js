const DAMAGE_COOLDOWN_MS = 1000;

export class Hero {
  #lastDamageAt = Number.NEGATIVE_INFINITY;

  constructor({
    id,
    name,
    emoji,
    hp = 100,
    attack = 10,
    defense = 5,
    speed = 220,
    position = { x: 400, y: 250 },
    aim = { x: 1, y: 0 },
  } = {}) {
    // Identity
    this.id = id;
    this.name = name;
    this.emoji = emoji;

    // Stats
    this.maxHp = hp;
    this.hp = hp;
    this.attack = attack;
    this.defense = defense;
    this.speed = speed;
    this.position = position;
    this.aim = aim;
  }

  damage(amount) {
    if (!Number.isFinite(amount) || amount <= 0 || this.hp <= 0) return 0;

    const now = Date.now();
    if (now - this.#lastDamageAt < DAMAGE_COOLDOWN_MS) return 0;

    const previousHp = this.hp;
    this.hp = Math.max(0, this.hp - amount);
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
