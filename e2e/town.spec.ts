import { expect, test } from '@playwright/test';
import { GAME_URL, startCase } from './helpers';

// The town is for PC screens; phones keep the evidence board.
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'PC only');
});

test('walk to the fish market, talk to a witness and open the first lead from its door', async ({ page }) => {
  test.slow();
  await startCase(page, 'inspector');
  await page.getByRole('button', { name: /Walk the town/ }).click();
  await expect(page).toHaveURL(/#\/town$/);
  await expect(page.locator('canvas.town-canvas')).toBeVisible();
  await expect(page.locator('.town-fallback')).toHaveCount(0);

  // straight north from the start is the Fish hall door
  const prompt = page.locator('.town-prompt');
  await page.keyboard.down('ArrowUp');
  await expect(prompt).toContainText('Fish hall', { timeout: 30_000 });
  await page.keyboard.up('ArrowUp');
  await expect(prompt).toContainText('work "Fish market cash book" (2 h)');

  // E at the door starts the lead and spends its 2 hours
  await page.keyboard.press('KeyE');
  await expect(page).toHaveURL(/#\/lead\/L1$/);
  await expect(page.getByText('10 of 12 hours left')).toBeVisible();

  // back out: the detective is still at the door
  await page.getByRole('button', { name: '← Town' }).click();
  await expect(page).toHaveURL(/#\/town$/);
  await expect(prompt).toContainText('keep working on "Fish market cash book"');

  // Rosa stands just west of the door
  await page.keyboard.down('ArrowLeft');
  await expect(prompt).toContainText('Talk to Rosa Diaz', { timeout: 30_000 });
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.press('KeyE');
  const talk = page.getByRole('dialog');
  await expect(talk.getByRole('heading')).toHaveText('Rosa Diaz');
  await expect(talk).toContainText('Has statements in: L1 Fish market cash book');
  await page.keyboard.press('Escape');
  await expect(talk).toHaveCount(0);

  // camera switch and the way back to the board
  await page.keyboard.press('KeyC');
  await expect(page.getByRole('button', { name: /Camera: Behind/ })).toBeVisible();
  await page.keyboard.press('KeyB');
  await expect(page.getByRole('heading', { name: 'Leads' })).toBeVisible();
});

test('story shots play once when new leads open, and can be skipped', async ({ page }) => {
  test.slow();
  await startCase(page, 'inspector');
  // close the first lead in the save, then come back straight into the town
  await page.evaluate(() => {
    const key = 'syndicate-ledger:save:v1';
    const save = JSON.parse(localStorage.getItem(key)!);
    save.leads.L1.started = true;
    save.leads.L1.solved = true;
    localStorage.setItem(key, JSON.stringify(save));
  });
  await page.goto(GAME_URL + '#/town');
  await page.reload();

  const caption = page.locator('.shot-caption');
  await expect(caption).toContainText('camera post', { timeout: 30_000 });
  await expect(page.locator('.town-prompt')).toHaveCount(0);
  await page.keyboard.press('KeyE');
  await expect(caption).toContainText('Net loft', { timeout: 30_000 });
  await page.getByRole('button', { name: /Skip/ }).click();
  await expect(page.getByRole('button', { name: /Camera: Angled/ })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('syndicate-ledger:save:v1')!).shotsSeen)).toEqual(['cameras-open', 'lockup-open']);

  // seen shots stay seen
  await page.reload();
  await expect(page.getByRole('button', { name: /Camera: Angled/ })).toBeVisible();
  await page.waitForTimeout(3000);
  await expect(caption).toHaveCount(0);
});

test('the board hides the town link on phone-sized screens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await startCase(page, 'inspector');
  await expect(page.getByRole('button', { name: /Walk the town/ })).toBeHidden();
});
