import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { DecodePuzzle } from '../src/engine/decode';
import { clearDialogs } from './helpers';

// the decode lead lives in the same demo case as the timeline (fixtures/timeline.html)
const URL = 'http://localhost:5199/fixtures/timeline.html?seed=0';
type AxePage = ConstructorParameters<typeof AxeBuilder>[0]['page'];

const puzzleOf = (page: Page, rank: string) => page.evaluate((r) => (window as unknown as { __book: Record<string, unknown> }).__book[`D1:${r}`], rank) as Promise<DecodePuzzle>;

async function openLead(page: Page, rank: RegExp) {
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('radiogroup', { name: 'Difficulty' }).getByRole('radio', { name: rank }).click();
  await page.getByRole('button', { name: 'Open the case' }).click();
  await page.getByRole('button', { name: 'Go to the evidence board' }).click();
  await page.locator('article.lead', { hasText: 'D1' }).getByRole('button').click();
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

test('the decode screen has no accessibility problems', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one browser is enough');
  await openLead(page, /Chief/);
  const results = await new AxeBuilder({ page: page as unknown as AxePage }).analyze();
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});
