import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { DecodePuzzle } from '../src/engine/decode';
import { clearDialogs } from './helpers';

// the decode lead lives in the same demo case as the timeline (fixtures/timeline.html)
const URL = 'http://localhost:5199/fixtures/timeline.html?seed=0';
type AxePage = ConstructorParameters<typeof AxeBuilder>[0]['page'];

const puzzleOf = (page: Page, rank: string, id = 'D1') => page.evaluate(([i, r]) => (window as unknown as { __book: Record<string, unknown> }).__book[`${i}:${r}`], [id, rank]) as Promise<DecodePuzzle>;

async function openLead(page: Page, rank: RegExp, id = 'D1') {
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('radiogroup', { name: 'Difficulty' }).getByRole('radio', { name: rank }).click();
  await page.getByRole('button', { name: 'Open the case' }).click();
  await page.getByRole('button', { name: 'Go to the evidence board' }).click();
  await page.locator('article.lead', { hasText: id }).getByRole('button').click();
  await clearDialogs(page);
}

test('a decode lead: read the exhibits, type the answer, close the lead', async ({ page }) => {
  await openLead(page, /Junior/);
  const p = await puzzleOf(page, 'junior');
  await expect(page.locator('.exhibit-h').first()).toBeVisible();
  await expect(page.locator('.exhibit')).toHaveCount(p.exhibits.length);
  await expect(page.locator('ul.stmts')).toHaveCount(0);

  await page.getByRole('button', { name: 'Close this lead' }).click();
  await expect(page.locator('.msg')).toContainText('Type your answer');

  const box = page.getByRole('textbox', { name: 'Your answer' });
  await box.fill('0000');
  await page.getByRole('button', { name: 'Close this lead' }).click();
  await expect(page.locator('.msg')).toContainText("isn't the answer");

  await box.fill(p.answer);
  await page.getByRole('button', { name: 'Close this lead' }).click();
  await expect(page.getByRole('dialog')).toContainText('Lead closed');
});

test('a nonogram lead: shade the grid, close the lead', async ({ page }) => {
  await openLead(page, /Junior/, 'D2');
  const p = await puzzleOf(page, 'junior', 'D2');
  await expect(page.locator('.nono-cell')).toHaveCount(25);
  await expect(page.getByRole('textbox', { name: 'Your answer' })).toHaveCount(0);

  const rows = p.answer.split(' ');
  // shade the wrong picture first: every cell
  await page.getByRole('button', { name: 'Row 1, column 1' }).click();
  await page.getByRole('button', { name: 'Close this lead' }).click();
  await expect(page.locator('.msg')).toContainText("isn't the answer");
  await page.getByRole('button', { name: 'Row 1, column 1' }).click();

  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      if (rows[r][c] === '1') await page.getByRole('button', { name: `Row ${r + 1}, column ${c + 1}` }).click();
    }
  }
  await expect(page.locator('.nono-cell.on')).toHaveCount(p.answer.replace(/[^1]/g, '').length);
  await page.getByRole('button', { name: 'Close this lead' }).click();
  await expect(page.getByRole('dialog')).toContainText('Lead closed');
});

test('a decode lead shows its carried numbers as pointers back to the earlier lead', async ({ page }) => {
  await openLead(page, /Junior/, 'D1');
  const first = await puzzleOf(page, 'junior');
  await page.getByRole('textbox', { name: 'Your answer' }).fill(first.answer);
  await page.getByRole('button', { name: 'Close this lead' }).click();
  await clearDialogs(page);
  await page.locator('article.lead', { hasText: 'D3' }).getByRole('button').click();
  await clearDialogs(page);
  const text = await page.locator('.exhibit').allInnerTexts();
  expect(text.join(' ')).toContain('digit of the answer to');
  expect(text.join(' ')).not.toContain('\u2039');
});

test('the decode screen has no accessibility problems', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one browser is enough');
  await openLead(page, /Chief/);
  const results = await new AxeBuilder({ page: page as unknown as AxePage }).analyze();
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});
