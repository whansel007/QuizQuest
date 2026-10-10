import { HEROES } from './hero.js';

const canvas = document.querySelector('#world');
const context = canvas.getContext('2d');
const heroList = document.querySelector('#hero-list');
const worldMessage = document.querySelector('#world-message');
const heroDetails = document.querySelector('#hero-details');
const heroStats = document.querySelector('#hero-stats');
const actions = document.querySelector('#actions');
const actionLog = document.querySelector('#action-log');
const keys = new Set();
const moveKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD']);
const actionButtons = [
  { slot: 'weapon', label: 'Test weapon' },
  { slot: 'skill', label: 'Test skill (E)' },
  { slot: 'ultimate', label: 'Test ultimate (Q)' },
  { slot: 'talent', label: 'Test talent' },
];

let selectedHero = null;
let previousFrame = 0;

function addListItem(list, text) {
  const item = document.createElement('li');
  item.textContent = text;
  list.append(item);
}

function selectHero(hero) {
  selectedHero = hero;
  hero.position = { x: canvas.width / 2, y: canvas.height / 2 };
  hero.aim = { x: 1, y: 0 };
  worldMessage.textContent = `Playing as ${hero.emoji} ${hero.name}. Aim follows your mouse.`;
  canvas.hidden = false;
  heroDetails.hidden = false;
  heroStats.replaceChildren();
  actionLog.replaceChildren();
  addListItem(actionLog, `${hero.name} entered the test world.`);
  [
    `HP: ${hero.hp} / ${hero.maxHp}`,
    `Attack: ${hero.attack}`,
    `Defense: ${hero.defense}`,
    `Weapon: ${hero.weapon.name}`,
    `Skill (E): ${hero.skill.name}`,
    `Ultimate (Q): ${hero.ultimate.name}`,
    `Talent: ${hero.talent.name}`,
    `Buff slots: ${hero.buffs.length} / ${hero.buffSlots} used`,
  ].forEach((stat) => addListItem(heroStats, stat));
}

function testAction(slot) {
  if (!selectedHero) return;
  addListItem(actionLog, selectedHero.use(slot));
  while (actionLog.children.length > 8) actionLog.firstElementChild.remove();
}

for (const hero of HEROES) {
  const item = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = `${hero.emoji} ${hero.name}`;
  button.addEventListener('click', () => selectHero(hero));
  item.append(button, ` — HP ${hero.maxHp}, attack ${hero.attack}, defense ${hero.defense}`);
  heroList.append(item);
}

for (const { slot, label } of actionButtons) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', () => testAction(slot));
  actions.append(button, ' ');
}

function onPointerMove(event) {
  if (!selectedHero) return;
  const rect = canvas.getBoundingClientRect();
  selectedHero.setAimFromPointer({
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  });
}

function onKeyDown(event) {
  if (!selectedHero || event.target.closest?.('input, textarea, select')) return;
  if (moveKeys.has(event.code)) {
    keys.add(event.code);
    event.preventDefault();
  } else if (event.code === 'KeyE' && !event.repeat) {
    testAction('skill');
  } else if (event.code === 'KeyQ' && !event.repeat) {
    testAction('ultimate');
  }
}

function onKeyUp(event) {
  keys.delete(event.code);
}

function draw(timestamp = 0) {
  requestAnimationFrame(draw);
  if (!selectedHero) return;

  const elapsed = previousFrame ? Math.min((timestamp - previousFrame) / 1000, 0.05) : 0;
  previousFrame = timestamp;
  let dx = Number(keys.has('ArrowRight') || keys.has('KeyD')) - Number(keys.has('ArrowLeft') || keys.has('KeyA'));
  let dy = Number(keys.has('ArrowDown') || keys.has('KeyS')) - Number(keys.has('ArrowUp') || keys.has('KeyW'));
  const length = Math.hypot(dx, dy);
  if (length) {
    dx /= length;
    dy /= length;
    selectedHero.position.x = Math.max(24, Math.min(canvas.width - 24, selectedHero.position.x + dx * 220 * elapsed));
    selectedHero.position.y = Math.max(24, Math.min(canvas.height - 24, selectedHero.position.y + dy * 220 * elapsed));
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#888';
  context.lineWidth = 1;
  context.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);

  const center = selectedHero.position;
  const tip = { x: center.x + selectedHero.aim.x * 48, y: center.y + selectedHero.aim.y * 48 };
  context.strokeStyle = '#222';
  context.fillStyle = '#222';
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(center.x, center.y);
  context.lineTo(tip.x, tip.y);
  context.stroke();

  const angle = Math.atan2(selectedHero.aim.y, selectedHero.aim.x);
  context.beginPath();
  context.moveTo(tip.x, tip.y);
  context.lineTo(tip.x - 12 * Math.cos(angle - Math.PI / 6), tip.y - 12 * Math.sin(angle - Math.PI / 6));
  context.lineTo(tip.x - 12 * Math.cos(angle + Math.PI / 6), tip.y - 12 * Math.sin(angle + Math.PI / 6));
  context.closePath();
  context.fill();

  context.font = '32px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(selectedHero.emoji, center.x, center.y);
}

canvas.addEventListener('pointermove', onPointerMove);
addEventListener('keydown', onKeyDown);
addEventListener('keyup', onKeyUp);
addEventListener('blur', () => keys.clear());
requestAnimationFrame(draw);
