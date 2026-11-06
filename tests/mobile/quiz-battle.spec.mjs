// Practice quiz battle stage: the two HP cards never cover the hero or the
// Fog, and every part of the battle stays inside the stage, from an iPhone 6
// (375 x 667) up to a desktop.
//
// Run: npm run test:mobile -- quiz-battle
// QUIZ_BATTLE_SHOTS=<dir> also saves a screenshot of the stage per size.
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { newStudentPage, openStudentTab, settle, intersects } from './helpers.mjs';

// The stage's parts: the HP cards, the enemy emoji (its glyph box) and the
// hero (the opaque pixels of its avatar canvas).
function measureStage() {
  const box = (r) => ({ x: r.left, y: r.top, right: r.right, bottom: r.bottom });
  const stage = box(document.querySelector('.quiz-battle-stage').getBoundingClientRect());
  const enemyCard = box(document.querySelector('.battle-enemy-status').getBoundingClientRect());
  const heroCard = box(document.querySelector('.battle-player-status').getBoundingClientRect());
  const turn = box(document.querySelector('.battle-turn-label').getBoundingClientRect());
  // the emoji's glyph: a Range hugs the text, not the line box
  const range = document.createRange();
  range.selectNodeContents(document.querySelector('.battle-enemy-sprite'));
  const enemy = box(range.getBoundingClientRect());
  const canvas = document.querySelector('.battle-player-sprite canvas');
  const c = canvas.getBoundingClientRect();
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let minX = canvas.width, maxX = -1, minY = canvas.height, maxY = -1;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (data[(y * canvas.width + x) * 4 + 3] > 40) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    }
  }
  const sx = c.width / canvas.width, sy = c.height / canvas.height;
  const hero = { x: c.left + minX * sx, y: c.top + minY * sy, right: c.left + (maxX + 1) * sx, bottom: c.top + (maxY + 1) * sy };
  return { stage, enemyCard, heroCard, turn, enemy, hero };
}

for (const [w, h] of [[375, 667], [320, 568], [360, 640], [412, 915], [667, 375], [768, 1024], [1024, 768], [1280, 800]]) {
  test(`quiz battle: HP cards clear of both fighters @ ${w}x${h}`, async ({ browser }) => {
    const { context, page } = await newStudentPage(browser, w, h);
    await openStudentTab(page, 'Quiz');
    await page.getByRole('button', { name: 'Start practice' }).click();
    await expect(page.getByText(/Question \d+ of \d+/).first()).toBeVisible();
    // let the avatar canvas draw
    await expect.poll(() => page.evaluate(() => {
      const cv = document.querySelector('.battle-player-sprite canvas');
      if (!cv) return false;
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 40) return true;
      return false;
    })).toBe(true);
    await page.locator('.quiz-battle-stage').scrollIntoViewIfNeeded();
    await settle(page);
    if (process.env.QUIZ_BATTLE_SHOTS) await page.locator('.quiz-battle-stage').screenshot({ path: path.join(process.env.QUIZ_BATTLE_SHOTS, `quiz-battle__${w}x${h}.png`) });
    const m = await page.evaluate(measureStage);
    const fmt = (b) => `${Math.round(b.x)},${Math.round(b.y)} - ${Math.round(b.right)},${Math.round(b.bottom)}`;
    for (const [cardName, card] of [['enemy card', m.enemyCard], ['hero card', m.heroCard]]) {
      for (const [spriteName, sprite] of [['Fog', m.enemy], ['hero', m.hero]]) {
        expect(intersects(card, sprite, 1), `${cardName} ${fmt(card)} covers the ${spriteName} ${fmt(sprite)}`).toBe(false);
      }
    }
    expect(intersects(m.enemyCard, m.heroCard), 'the two HP cards overlap').toBe(false);
    for (const [name, b] of [['enemy card', m.enemyCard], ['hero card', m.heroCard], ['Fog', m.enemy], ['hero', m.hero]]) {
      expect(b.x, `${name} left inside the stage`).toBeGreaterThanOrEqual(m.stage.x - 0.5);
      expect(b.right, `${name} right inside the stage`).toBeLessThanOrEqual(m.stage.right + 0.5);
      expect(b.y, `${name} top inside the stage`).toBeGreaterThanOrEqual(m.stage.y - 0.5);
      expect(b.bottom, `${name} bottom inside the stage`).toBeLessThanOrEqual(m.stage.bottom + 0.5);
    }
    // the turn label sits clear of the hero card
    expect(intersects(m.turn, m.heroCard, 1), 'turn label under the hero card').toBe(false);
    await context.close();
  });
}
