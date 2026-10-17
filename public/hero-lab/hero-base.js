import { Weapon } from './weapon.js';
import { Skill } from './skill.js';
import { Ultimate } from './ultimate.js';

export class Hero {
  constructor({ id, name, emoji, stats, weapon, skill, ultimate, talent, buffSlots = 3 }) {
    this.id = id;
    this.name = name;
    this.emoji = emoji;
    this.maxHp = stats.hp;
    this.hp = stats.hp;
    this.attack = stats.attack;
    this.defense = stats.defense;
    this.weapon = weapon instanceof Weapon ? weapon : new Weapon(weapon);
    this.skill = skill instanceof Skill ? skill : new Skill(skill);
    this.ultimate = ultimate instanceof Ultimate ? ultimate : new Ultimate(ultimate);
    this.talent = talent;
    this.buffSlots = buffSlots;
    this.buffs = [];
    this.position = { x: 400, y: 250 };
    this.aim = { x: 1, y: 0 };
  }

  use(slot) {
    const ability = this[slot];
    if (!ability) throw new Error(`Unknown hero action: ${slot}`);
    if (typeof ability.activate === 'function') {
      return ability.activate(this);
    }
    return `${this.name} tested ${ability.name}: ${ability.description}`;
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
