import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { StakeoutPuzzle } from '../src/engine/stakeout';
import { clearDialogs } from './helpers';

// the stakeout lead lives in the same demo case as the timeline (fixtures/timeline.html)
const URL = 'http://localhost:5199/fixtures/timeline.html?seed=0';
type AxePage = ConstructorParameters<typeof AxeBuilder>[0]['page'];

const puzzleOf = (page: Page, rank: string) => page.evaluate((r) => (window as unknown as { __book: Record<string, unknown> }).__book[`S1:${r}`], rank) as Promise<StakeoutPuzzle>;
const cell = (page: Page, r: number, c: number) => page.locator(`[data-stake="${r}-${c}"]`);

async function openLead(page: Page, rank: RegExp) {
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('radiogroup', { name: 'Difficulty' }).getByRole('radio', { name: rank }).click();
  await page.getByRole('button', { name: 'Open the case' }).click();
  await page.getByRole('button', { name: 'Go to the evidence board' }).click();
  await page.locator('article.lead', { hasText: 'S1' }).getByRole('button').click();
  await clearDialogs(page);
}

test('a stakeout lead: place a watchman in every district, mark the witnesses, close the lead', async ({ page }) => {
  await openLead(page, /Junior/);
  const p = await puzzleOf(page, 'junior');
  await expect(page.getByRole('heading', { name: 'The night watch' })).toBeVisible();
  await expect(page.locator('.stake-cell')).toHaveCount(p.size * p.size);
  const stmts = page.locator('ul.stmts > li.stmt:not(.paid)');
  await expect(stmts).toHaveCount(p.statements.length);

  await page.getByRole('button', { name: 'Close this lead' }).click();
  await expect(page.locator('.msg')).toContainText('no watcher');

  // a wrong square in the first row stops the lead; two in one column are outlined
  const wrongCol = (p.cols[0] + 2) % p.size;
  await cell(page, 0, wrongCol).click();
  for (let r = 1; r < p.size; r++) await cell(page, r, p.cols[r]).click();
  await page.getByRole('button', { name: 'Close this lead' }).click();
  await expect(page.locator('.msg')).toContainText('wrong square');
  // tapping the same square takes the watchman off, then the right one goes on
  await cell(page, 0, wrongCol).click();
  await expect(cell(page, 0, wrongCol)).not.toHaveClass(/placed/);
  await cell(page, 0, p.cols[0]).click();
  await expect(page.locator('.stake-cell.placed')).toHaveCount(p.size);

  await page.getByRole('button', { name: 'Close this lead' }).click();
  await expect(page.locator('.msg')).toContainText('Mark every statement');
  for (let i = 0; i < p.statements.length; i++) await stmts.nth(i).getByRole('button', { name: p.truth[i] ? 'True' : 'Lie', exact: true }).click();
  await page.getByRole('button', { name: 'Close this lead' }).click();
  await expect(page.getByRole('dialog')).toContainText('Lead closed');
});

test('arrow keys move between squares, and Ctrl+Z takes a watchman back', async ({ page }) => {
  await openLead(page, /Junior/);
  await cell(page, 0, 0).focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await expect(cell(page, 1, 1)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(cell(page, 1, 1)).toHaveClass(/placed/);
  await page.keyboard.press('Control+z');
  await expect(cell(page, 1, 1)).not.toHaveClass(/placed/);
});

test('two watchmen that break a rule are outlined', async ({ page }) => {
  await openLead(page, /Junior/);
  await cell(page, 0, 0).click();
  await cell(page, 1, 1).click();
  await expect(page.locator('.stake-cell.clash')).toHaveCount(2);
  await expect(page.getByRole('status').filter({ hasText: 'break a rule' })).toBeVisible();
});

test('every rank has its own map, and the screen has no accessibility problems', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one browser is enough');
  await openLead(page, /Chief/);
  const p = await puzzleOf(page, 'chief');
  expect(p.size).toBe(8);
  await expect(page.locator('.stake-cell')).toHaveCount(64);
  const results = await new AxeBuilder({ page: page as unknown as AxePage }).analyze();
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});
