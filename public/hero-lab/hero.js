export class Hero {
  constructor({ id, name, emoji, stats, weapon, skill, ultimate, talent, buffSlots = 3 }) {
    this.id = id;
    this.name = name;
    this.emoji = emoji;
    this.maxHp = stats.hp;
    this.hp = stats.hp;
    this.attack = stats.attack;
    this.defense = stats.defense;
    this.weapon = weapon;
    this.skill = skill;
    this.ultimate = ultimate;
    this.talent = talent;
    this.buffSlots = buffSlots;
    this.buffs = [];
    this.position = { x: 400, y: 250 };
    this.aim = { x: 1, y: 0 };
  }

  use(slot) {
    const ability = this[slot];
    if (!ability) throw new Error(`Unknown hero action: ${slot}`);
    return `${this.name} tested ${ability.name}: ${ability.description}`;
  }

  setAimFromPointer(pointer) {
    const dx = pointer.x - this.position.x;
    const dy = pointer.y - this.position.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 0) this.aim = { x: dx / distance, y: dy / distance };
  }
}

export const HEROES = [
  {
    id: 'flamekeeper',
    name: 'Flamekeeper',
    emoji: '🧙',
    stats: { hp: 100, attack: 14, defense: 5 },
    weapon: { name: 'Ember Staff', description: 'a basic staff attack toward the aim arrow.' },
    skill: { name: 'Firebolt', description: 'a quick burst of fire in the aimed direction.' },
    ultimate: { name: 'Meteor Storm', description: 'a large area attack around the aimed point.' },
    talent: { name: 'Kindled', description: 'gains power while close to the campfire.' },
  },
  {
    id: 'ranger',
    name: 'Ranger',
    emoji: '🏹',
    stats: { hp: 85, attack: 18, defense: 3 },
    weapon: { name: 'Longbow', description: 'a precise arrow toward the aim arrow.' },
    skill: { name: 'Volley', description: 'fires a fan of arrows in the aimed direction.' },
    ultimate: { name: 'Starfall', description: 'rains arrows on the aimed point.' },
    talent: { name: 'Keen Eye', description: 'deals extra damage to distant targets.' },
  },
  {
    id: 'guardian',
    name: 'Guardian',
    emoji: '🛡️',
    stats: { hp: 130, attack: 10, defense: 9 },
    weapon: { name: 'Iron Mace', description: 'a sturdy strike toward the aim arrow.' },
    skill: { name: 'Shield Rush', description: 'charges in the aimed direction.' },
    ultimate: { name: 'Bulwark', description: 'raises a protective barrier around the campfire.' },
    talent: { name: 'Steadfast', description: 'takes less damage while nearby allies are hurt.' },
  },
].map((definition) => new Hero(definition));
