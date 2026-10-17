export class Ultimate {
  constructor({ name, description, activate }) {
    this.name = name;
    this.description = description;
    if (typeof activate === 'function') this.activate = activate;
  }

  activate(hero) {
    return `${hero.name} activated ${this.name}: ${this.description}`;
  }
}

export default Ultimate;
