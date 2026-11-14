import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { newGame } from '../src/game/state';
import { book, cf, clearDialogs, GAME_URL, solveLead, startCase } from './helpers';

// @axe-core/playwright is typed against its own copy of Playwright
type AxePage = ConstructorParameters<typeof AxeBuilder>[0]['page'];

async function expectAccessible(page: Page) {
  const { violations } = await new AxeBuilder({ page: page as unknown as AxePage }).analyze();
  const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
}

test('a v1 save loads and continues', async ({ page }) => {
  const g = newGame(cf, book, 'inspector');
  g.s.leads.L1.started = true;
  g.s.leads.L1.solved = true;
  g.s.hoursUsed = 2;
  await page.addInitScript((save) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('syndicate-ledger:save:v1', save);
      sessionStorage.setItem('seeded', '1');
    }
  }, JSON.stringify(g.s));
  await page.goto(GAME_URL);
  await page.getByRole('button', { name: 'Continue case (Inspector)' }).click();
  await expect(page.locator('article.lead', { hasText: 'L1' }).locator('.lead-state')).toHaveText('✓ Solved');
  await expect(page.getByText('10 of 12 hours left')).toBeVisible();
});

test('progress survives a reload, and back returns to the board', async ({ page }) => {
  await startCase(page, 'junior');
  await solveLead(page, 'junior', 'L1');
  await clearDialogs(page, { 'wants a word': 'Decline' });
  await page.locator('article.lead', { hasText: 'L2' }).getByRole('button').click();
  await expect(page).toHaveURL(/#\/lead\/L2$/);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/./);
  await expect(page.locator('table.grid')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Leads' })).toBeVisible();
  await expect(page.locator('article.lead', { hasText: 'L1' }).locator('.lead-state')).toHaveText('✓ Solved');
});

test('pencil marks, undo and redo work from the keyboard', async ({ page }) => {
  await startCase(page, 'inspector');
  await page.locator('article.lead', { hasText: 'L1' }).getByRole('button').click();
  const p = book['L1:inspector'];
  const given = new Set(p.givens.map((x) => `${x.cell[0]},${x.cell[1]}`));
  const [r, c] = [...Array(36).keys()].map((i) => [Math.floor(i / 6), i % 6]).find(([r, c]) => !given.has(`${r},${c}`))!;
  const cell = page.locator('table.grid tbody tr').nth(r).locator('td').nth(c);
  await cell.click();
  await page.keyboard.press('p');
  await page.keyboard.press('2');
  await page.keyboard.press('5');
  await expect(cell.locator('.notes')).toHaveText('25');
  await page.keyboard.press('p');
  await page.keyboard.press('3');
  await expect(cell.locator('.val')).toHaveText('3');
  await page.keyboard.press('Control+z');
  await expect(cell.locator('.val')).toHaveCount(0);
  await page.keyboard.press('Control+Shift+z');
  await expect(cell.locator('.val')).toHaveText('3');
});

test('screens have no serious accessibility problems', async ({ page }) => {
  await page.goto(GAME_URL);
  await expectAccessible(page);
  await startCase(page, 'detective');
  await expectAccessible(page);
  await page.locator('article.lead', { hasText: 'L1' }).getByRole('button').click();
  await clearDialogs(page);
  await expectAccessible(page);
});

test('help opens from anywhere and follows the chosen rank', async ({ page }) => {
  await page.goto(GAME_URL);
  await page.getByRole('radio', { name: /Chief/ }).click();
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  const help = page.getByRole('dialog', { name: /Help/ });
  await expect(help).toContainText('Chief rank');
  await help.getByRole('tab', { name: 'Your rank' }).click();
  await expect(help).toContainText('11 hours over 3 days');
  await expectAccessible(page);
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();

  await startCase(page, 'junior');
  await page.keyboard.press('?');
  await help.getByRole('tab', { name: 'The case' }).click();
  await expect(help).toContainText('Open now');
  await expect(help).not.toContainText('hours');
  await help.getByRole('button', { name: 'Close help' }).click();
  await expect(help).toBeHidden();
});

test('a tip pops up after 5 minutes without a move, and says what to do there', async ({ page }) => {
  await page.clock.install();
  await startCase(page, 'inspector');
  await page.clock.fastForward('04:00');
  await expect(page.getByRole('status', { name: 'Tip' })).toBeHidden();
  await page.clock.fastForward('01:10');
  const tip = page.getByRole('status', { name: 'Tip' });
  await expect(tip).toContainText('The evidence board');
  await expect(tip).toContainText('Open Fish market cash book');
  await tip.getByRole('button', { name: 'Dismiss tip' }).click();
  await expect(tip).toBeHidden();
  // any click starts the countdown again
  await page.clock.fastForward('03:00');
  await page.mouse.click(5, 300);
  await page.clock.fastForward('03:00');
  await expect(tip).toBeHidden();
});
