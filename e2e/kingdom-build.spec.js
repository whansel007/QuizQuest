// kingdom-build.spec.js
// End-to-end test for building in the Kingdom town: the student opens the
// Kingdom tab, picks the Library out of the HUD's building list and builds
// it, and the panel says the building went up.
//
// The seeded demo student is used on purpose. The debug endpoint that sets a
// resource balance only answers for the synthetic demo accounts, and a build
// is paid for in wood, crystal and herbs. The endpoint sets an absolute
// balance, so every run of this test starts from the same place.
import { test, expect } from '@playwright/test';
import { signIn, openTab, apiToken, STUDENT } from './helpers.js';

// The balances the test needs. The three Library levels cost 5 + 8 + 12
// wood, 3 + 6 crystal and 4 herb between them, so these are enough for all
// of them.
const GRANTS = { wood: 40, crystal: 20, herb: 20 };

// What the panel's build button says at each level, and what that level
// costs. The list is indexed by the level the building is at now.
const BUILD_LABELS = [
  'Build · 5 🪵',
  'Upgrade · 8 🪵 + 3 💎',
  'Upgrade · 12 🪵 + 6 💎 + 4 🌿',
];

// Put the demo student's resources where this test wants them. The endpoint
// sets an absolute balance, so a second run of the test starts from the
// same place.
async function setResources(page, balances) {
  const token = await apiToken(page);
  for (const [resource, balance] of Object.entries(balances)) {
    const response = await page.request.post('/api/student/debug/resources', {
      headers: { Authorization: `Bearer ${token}` },
      data: { resource, balance },
    });
    const body = await response.text();
    expect(response.ok(), `the ${resource} balance is set to ${balance}: ${body}`).toBe(true);
  }
}

// Open the Kingdom and put the first-visit tour out of the way.
//
// The tour is remembered per student in this browser, so it shows itself the
// first time the town is seen and never again. It is a card along the bottom
// of the town, so it does not cover the HUD, but it is dismissed before the
// building list is opened.
async function openKingdom(page) {
  await openTab(page, 'Kingdom');
  await expect(page.getByRole('heading', { name: /Your Kingdom.*Storybook Town/ })).toBeVisible();
  const skip = page.getByRole('button', { name: 'Skip', exact: true });
  if (await skip.isVisible()) await skip.click();
}

test('the Library is built from the building list and the panel says it went up', async ({ page }) => {
  // The town draws itself on a canvas, and WebKit is the slowest engine
  // here: the journey needs more than the default minute.
  test.slow();
  await signIn(page, STUDENT);
  // The town reads the kingdom once, when it opens, so the resources have to
  // be in place before the tab is opened.
  await setResources(page, GRANTS);
  await openKingdom(page);

  // The HUD's building list: the castle and the four buildings.
  await page.getByRole('button', { name: 'Buildings', exact: true }).click();
  const buildings = page.getByRole('region', { name: 'Your buildings', exact: true });
  await expect(buildings.getByRole('button')).toHaveCount(5);

  // The Library's level before the build. It is read rather than assumed: a
  // CI retry replays the test against the same data file, so the Library may
  // already be one level up.
  const libRow = buildings.getByRole('button', { name: /^Library/ });
  await expect(libRow).toBeVisible();
  const before = Number((await libRow.innerText()).match(/Lv (\d+)\/3/)[1]);

  // Picking the Library opens its panel and puts the list away.
  await libRow.click();
  const panel = page.getByRole('dialog', { name: 'Library', exact: true });
  await expect(panel).toBeVisible();
  await expect(panel.locator('.panel-level')).toHaveText(`Level ${before} / 3`);

  const build = panel.getByRole('button', { name: /^(Build|Upgrade) · / });
  if (before >= BUILD_LABELS.length) {
    // The Library is already at its cap, which a replay against the same
    // data file can leave it at. The panel says so instead of offering a
    // build.
    await expect(build).toHaveCount(0);
    await expect(panel.getByText('Highest level')).toBeVisible();
    return;
  }

  // The button says what the next level costs, and it is live: the student
  // can pay for it.
  await expect(build).toHaveText(BUILD_LABELS[before]);
  await expect(build).toBeEnabled();

  await build.click();

  // The toast says the building went up. It is watched from the moment the
  // build is sent, because it fades out of sight after a few seconds; the
  // text itself stays in the DOM afterwards.
  const toastSaid = page.waitForFunction(() => {
    const el = document.querySelector('#toast');
    return !!el && el.classList.contains('show') && el.textContent.trim() === 'Library upgraded!';
  }, null, { timeout: 30_000 }).then(() => true, () => false);

  // The build went through: the panel is one level up.
  await expect(panel.locator('.panel-level')).toHaveText(`Level ${before + 1} / 3`);
  if (before + 1 >= BUILD_LABELS.length) {
    await expect(panel.getByText('Highest level')).toBeVisible();
  } else {
    // The button now asks for the next level's price.
    await expect(build).toHaveText(BUILD_LABELS[before + 1]);
  }

  expect(await toastSaid, 'the toast says the Library went up').toBe(true);
  await expect(page.locator('#toast')).toHaveText('Library upgraded!');

  // And the level sticks: the list says so once the panel is closed.
  await panel.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(panel).toBeHidden();
  await page.getByRole('button', { name: 'Buildings', exact: true }).click();
  await expect(libRow).toContainText(`Lv ${before + 1}/3`);
});

test('the server refuses a building the student cannot pay for', async ({ page }) => {
  test.slow();
  await signIn(page, STUDENT);
  const token = await apiToken(page);

  // An empty purse: every building costs something.
  await setResources(page, { wood: 0, crystal: 0, herb: 0 });

  // The request id is checked first, so a build without one is turned away
  // before the server looks at the purse.
  const noId = await page.request.post('/api/student/kingdom/build', {
    headers: { Authorization: `Bearer ${token}` },
    data: { building: 'tower' },
  });
  const noIdBody = await noId.text();
  expect(noId.status(), noIdBody).toBe(400);
  expect(JSON.parse(noIdBody).error).toBe('Missing request id.');

  // With a request id of its own, the build is refused for the reason that
  // matters: the Tower costs 4 crystal and there is none.
  const poor = await page.request.post('/api/student/kingdom/build', {
    headers: { Authorization: `Bearer ${token}` },
    data: { building: 'tower', requestId: crypto.randomUUID() },
  });
  const body = await poor.text();
  expect(poor.status(), body).toBe(400);
  expect(JSON.parse(body).error).toBe('Not enough resources.');
});
