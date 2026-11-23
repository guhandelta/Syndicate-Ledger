import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { CipherPuzzle } from '../src/engine/cipher';
import { clearDialogs } from './helpers';

// the cipher lead lives in the same demo case as the timeline (fixtures/timeline.html)
const URL = 'http://localhost:5199/fixtures/timeline.html?seed=0';
type AxePage = ConstructorParameters<typeof AxeBuilder>[0]['page'];

const puzzleOf = (page: Page, rank: string) => page.evaluate((r) => (window as unknown as { __book: Record<string, unknown> }).__book[`C1:${r}`], rank) as Promise<CipherPuzzle>;

async function openLead(page: Page, rank: RegExp) {
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('radiogroup', { name: 'Difficulty' }).getByRole('radio', { name: rank }).click();
  await page.getByRole('button', { name: 'Open the case' }).click();
  await page.getByRole('button', { name: 'Go to the evidence board' }).click();
  await page.locator('article.lead', { hasText: 'C1' }).getByRole('button').click();
  await clearDialogs(page);
}

test('a cipher lead: enter the code, mark the witnesses, close the lead', async ({ page }) => {
  await openLead(page, /Junior/);
  const p = await puzzleOf(page, 'junior');
  await expect(page.getByRole('heading', { name: 'The chest lock' })).toBeVisible();
  const stmts = page.locator('ul.stmts > li.stmt:not(.paid)');
  await expect(stmts).toHaveCount(p.statements.length);

  await page.getByRole('button', { name: 'Close this lead' }).click();
  await expect(page.locator('.msg')).toContainText('still empty');

  const slots = page.locator('ol.code > li.code-slot');
  await expect(slots).toHaveCount(p.size);
  // a wrong first digit stops the lead
  const wrong = (p.code[0] % (p.size + 1)) + 1;
  await slots.nth(0).locator('select').selectOption(String(wrong));
  for (let k = 1; k < p.size; k++) await slots.nth(k).locator('select').selectOption(String(p.code[k]));
  await page.getByRole('button', { name: 'Close this lead' }).click();
  await expect(page.locator('.msg')).toContainText(/wrong|used twice/);
  await slots.nth(0).locator('select').selectOption(String(p.code[0]));

  await page.getByRole('button', { name: 'Close this lead' }).click();
  await expect(page.locator('.msg')).toContainText('Mark every statement');
  for (let i = 0; i < p.statements.length; i++) await stmts.nth(i).getByRole('button', { name: p.truth[i] ? 'True' : 'Lie', exact: true }).click();
  await page.getByRole('button', { name: 'Close this lead' }).click();
  await expect(page.getByRole('dialog')).toContainText('Lead closed');
});

test('the keyboard enters a digit at the picked place, and 0 clears it', async ({ page }) => {
  await openLead(page, /Junior/);
  const p = await puzzleOf(page, 'junior');
  const slots = page.locator('ol.code > li.code-slot');
  await slots.nth(1).getByRole('button').click();
  await page.keyboard.press(String(p.code[1]));
  await expect(slots.nth(1).locator('select')).toHaveValue(String(p.code[1]));
  await page.keyboard.press('0');
  await expect(slots.nth(1).locator('select')).toHaveValue('0');
  await page.keyboard.press('ArrowRight');
  await expect(slots.nth(2)).toHaveClass(/picked/);
});

test('every rank has its own code, and the screen has no accessibility problems', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one browser is enough');
  await openLead(page, /Chief/);
  const p = await puzzleOf(page, 'chief');
  expect(p.size).toBe(7);
  await expect(page.locator('ol.code .tag', { hasText: 'Fixed' })).toHaveCount(1);
  const results = await new AxeBuilder({ page: page as unknown as AxePage }).analyze();
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});
