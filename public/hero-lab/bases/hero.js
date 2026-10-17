export class Hero {
  constructor({
    id,
    name,
    emoji,
    hp = 100,
    attack = 10,
    defense = 5,
    weaponName,
    weaponDescription,
    skillName,
    skillDescription,
    ultimateName,
    ultimateDescription,
    talent,
    buffSlots = 3,
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
    
    this.talent = talent;
    this.buffSlots = buffSlots;
    this.buffs = [];
    
    // World
    this.position = position;
    this.aim = aim;

    // Lore
    this.weaponName = weaponName;
    this.weaponDescription = weaponDescription;
    this.skillName = skillName;
    this.skillDescription = skillDescription;
    this.ultimateName = ultimateName;
    this.ultimateDescription = ultimateDescription;
  }

  fire(mode = 'primary', actor = this) {
    return {
      status: 'activated',
      mode,
      hero: actor.name || this.name,
      weapon: this.weaponName,
      aim: actor.aim ? { ...actor.aim } : { x: 1, y: 0 },
      position: actor.position
        ? { ...actor.position }
        : { x: actor.x ?? 0, y: actor.y ?? 0 },
      timestamp: Date.now(),
    };
  }

  use(slot) {
    const actions = {
      weapon: { name: this.weaponName, description: this.weaponDescription },
      skill: { name: this.skillName, description: this.skillDescription },
      ultimate: { name: this.ultimateName, description: this.ultimateDescription },
      talent: this.talent,
    };
    const action = actions[slot];
    if (!action?.name || !action.description) throw new Error(`Unknown hero action: ${slot}`);
    return `${this.name} activated ${action.name}: ${action.description}`;
  }

  damage(dmg){
    this.hp -= dmg
  }

  heal(hl){
    this.hp += hl
  }

  setAimFromPointer(pointer) {
    const dx = pointer.x - this.position.x;
    const dy = pointer.y - this.position.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 0) this.aim = { x: dx / distance, y: dy / distance };
  }
}

export default Hero;
