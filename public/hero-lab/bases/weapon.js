export class Weapon {
  constructor({ name, description, fire }) {
    this.name = name;
    this.description = description;
    if (typeof fire === 'function') this.fire = fire;
  }

  fire(hero, mode = 'primary') {
    const aim = hero?.aim ? { ...hero.aim } : { x: 1, y: 0 };
    const position = hero?.position
      ? { ...hero.position }
      : { x: hero?.x ?? 0, y: hero?.y ?? 0 };
    return {
      status: 'activated',
      mode,
      hero: hero?.name || 'Hero',
      weapon: this.name,
      aim,
      position,
      timestamp: Date.now(),
    };
  }
}

export default Weapon;
