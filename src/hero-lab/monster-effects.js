const { GAME_CONFIG, HOLD_REHOLD_IMMUNITY_MS, PUSH_DEFAULT_DURATION_MS,
  DUMMY_PUSH_MULTIPLIER } = require('../../public/hero-lab/game-config.js');

const isBossOrKing = (entity) => Boolean(entity?.isBoss || entity?.type === 'brute-king');

/** Start an eased, server-authoritative push. Direction can be supplied as a
 * vector, or derived from an origin. Bounds and circular obstacles are tested
 * on every movement step so pushes cannot pass through the arena edge/fire. */
function applyPush(entity, direction, distancePx, durationMs, opts = {}) {
  if (!entity || entity.dead || !Number.isFinite(distancePx) || distancePx <= 0) return false;
  if ((opts.respectBossImmunity ?? true) && isBossOrKing(entity)) return false;

  let dx = direction?.dirX;
  let dy = direction?.dirY;
  if (Number.isFinite(direction?.fromX) && Number.isFinite(direction?.fromY)) {
    dx = entity.x - direction.fromX;
    dy = entity.y - direction.fromY;
  }
  const length = Math.hypot(dx || 0, dy || 0);
  if (!length) return false;

  const bruteScale = entity.type === 'brute' && !opts.ignoreHalfKnockback
    ? GAME_CONFIG.arenaTuning.knockback.bruteMultiplier : 1;
  const dummyScale = entity.isDummy ? (opts.dummyMultiplier ?? DUMMY_PUSH_MULTIPLIER) : 1;
  entity.pushMotion = {
    startX: entity.x, startY: entity.y,
    dirX: dx / length, dirY: dy / length,
    distancePx: distancePx * bruteScale * dummyScale,
    durationMs: Math.max(1, durationMs || PUSH_DEFAULT_DURATION_MS), startedAt: opts.now ?? Date.now(), lastProgress: 0,
    bounds: opts.bounds || { minX: 0, minY: 0, maxX: GAME_CONFIG.arena.width, maxY: GAME_CONFIG.arena.height },
    obstacles: opts.obstacles || [],
  };
  // Replace old inertial knockback so both systems cannot add distance.
  entity.knockbackX = 0;
  entity.knockbackY = 0;
  return true;
}

function stepPush(entity, now = Date.now()) {
  const motion = entity?.pushMotion;
  if (!motion) return;
  const t = Math.min(1, Math.max(0, (now - motion.startedAt) / motion.durationMs));
  const eased = 1 - (1 - t) * (1 - t);
  const distance = (eased - motion.lastProgress) * motion.distancePx;
  const radius = entity.radius || 0;
  const minX = motion.bounds.minX + radius, maxX = motion.bounds.maxX - radius;
  const minY = motion.bounds.minY + radius, maxY = motion.bounds.maxY - radius;
  const nextX = Math.min(maxX, Math.max(minX, entity.x + motion.dirX * distance));
  const nextY = Math.min(maxY, Math.max(minY, entity.y + motion.dirY * distance));
  const blocked = motion.obstacles.some((obstacle) => {
    const dx = nextX - obstacle.x, dy = nextY - obstacle.y;
    const oldDx = entity.x - obstacle.x, oldDy = entity.y - obstacle.y;
    const minDistance = radius + (obstacle.radius || 0);
    const nextDistanceSq = dx * dx + dy * dy;
    const oldDistanceSq = oldDx * oldDx + oldDy * oldDy;
    return nextDistanceSq < minDistance * minDistance && nextDistanceSq < oldDistanceSq;
  });
  if (!blocked) { entity.x = nextX; entity.y = nextY; }
  motion.lastProgress = eased;
  if (t >= 1 || blocked) entity.pushMotion = null;
}

function applyHold(entity, durationMs, sourceId, now = Date.now()) {
  if (!entity || entity.dead || isBossOrKing(entity) || entity.isDummy && entity.isBoss) return false;
  if ((entity.holdImmuneUntil || 0) > now || (entity.heldUntil || 0) > now) return false;
  entity.heldUntil = now + Math.max(0, durationMs);
  entity.holdSourceId = sourceId || null;
  entity.holdImmuneUntil = entity.heldUntil + HOLD_REHOLD_IMMUNITY_MS;
  entity.pushMotion = null;
  entity.knockbackX = 0;
  entity.knockbackY = 0;
  // A hold cancels active skeleton and Exploder telegraphs before they can fire.
  entity.windupUntil = 0;
  entity.windupAim = null;
  entity.fuseUntil = 0;
  return true;
}

function applySlow(entity, pct, durationMs, sourceId, now = Date.now()) {
  if (!entity || entity.dead || !Number.isFinite(pct) || pct <= 0 || durationMs <= 0) return false;
  const slows = (entity.slowEffects || []).filter((slow) => slow.until > now && slow.sourceId !== sourceId);
  slows.push({ pct: Math.min(1, pct), until: now + durationMs, sourceId: sourceId || null });
  entity.slowEffects = slows;
  entity.slowPct = Math.max(...slows.map((slow) => slow.pct));
  entity.slowUntil = Math.max(...slows.filter((slow) => slow.pct === entity.slowPct).map((slow) => slow.until));
  return true;
}

function stepMonsterEffects(entity, now = Date.now()) {
  stepPush(entity, now);
  if (entity.slowEffects?.length) {
    entity.slowEffects = entity.slowEffects.filter((slow) => slow.until > now);
    entity.slowPct = entity.slowEffects.reduce((max, slow) => Math.max(max, slow.pct), 0);
    entity.slowUntil = entity.slowEffects.reduce((until, slow) => Math.max(until, slow.until), 0);
  }
}

module.exports = { applyPush, applyHold, applySlow, stepPush, stepMonsterEffects, isBossOrKing };
