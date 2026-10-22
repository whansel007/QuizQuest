import { Projectile } from '../bases/projectile.js';
import { GAME_CONFIG } from '../game-config.js';

export class EnemyProjectile extends Projectile {
  constructor(options = {}) {
    super({ ...GAME_CONFIG.projectiles.enemyBullet, kind: 'enemy', ...options });
    this.type = 'enemy-bullet';
  }
}

export default EnemyProjectile;
