import { Weapon } from './weapon.js';
import { Skill } from './skill.js';
import { Ultimate } from './ultimate.js';

export class Hero {
  constructor({
    id,
    name,
    emoji,
    stats = {},
    weapon,
    skill,
    ultimate,
    talent,
    buffSlots = 3,
    position = { x: 400, y: 250 },
    aim = { x: 1, y: 0 },
  } = {}) {
    this.id = id;
    this.name = name;
    this.emoji = emoji;
    this.stats = { hp: 100, attack: 10, defense: 5, ...stats };
    this.maxHp = this.stats.hp;
    this.hp = this.stats.hp;
    this.attack = this.stats.attack;
    this.defense = this.stats.defense;
    this.weapon = weapon instanceof Weapon ? weapon : (weapon ? new Weapon(weapon) : null);
    this.skill = skill instanceof Skill ? skill : (skill ? new Skill(skill) : null);
    this.ultimate = ultimate instanceof Ultimate ? ultimate : (ultimate ? new Ultimate(ultimate) : null);
    this.talent = talent;
    this.buffSlots = buffSlots;
    this.buffs = [];
    this.position = position;
    this.aim = aim;
  }

  use(slot) {
    const ability = this[slot];
    if (!ability) throw new Error(`Unknown hero action: ${slot}`);
    return `${this.name} tested ${ability.name}: ${ability.description}`;
  }

  testAction(slot) {
    return this.use(slot);
  }

  fire(mode = 'primary') {
    if (this.weapon && typeof this.weapon.fire === 'function') {
      return this.weapon.fire(this, mode);
    }
    return {
      status: 'activated',
      mode,
      hero: this.name,
      weapon: this.weapon?.name || 'Unarmed',
      aim: { ...this.aim },
      position: { ...this.position },
      timestamp: Date.now(),
    };
  }

  setAimFromPointer(pointer) {
    const dx = pointer.x - this.position.x;
    const dy = pointer.y - this.position.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 0) this.aim = { x: dx / distance, y: dy / distance };
  }
}

export default Hero;
