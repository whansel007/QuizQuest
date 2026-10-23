// The demo account picker is not part of the normal sign-in view: it is hidden
// behind Tools and version plus the Konami code. Every browser test has to open
// it the same way before it can click a demo account, so that lives here once.
async function unlockTestAccounts(page) {
  await page.getByRole('button', { name: 'Tools and version' }).click();
  for (const key of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a', 'Enter']) {
    await page.keyboard.press(key);
  }
  await page.getByRole('heading', { name: 'Test accounts' }).waitFor();
}
module.exports = { unlockTestAccounts };