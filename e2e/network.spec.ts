import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { pairs, type NetworkPuzzle } from '../src/engine/network';
import { clearDialogs } from './helpers';

// the network lead lives in the same demo case as the timeline (fixtures/timeline.html)
const URL = 'http://localhost:5199/fixtures/timeline.html';
type AxePage = ConstructorParameters<typeof AxeBuilder>[0]['page'];

const puzzleOf = (page: Page, rank: string) => page.evaluate((r) => (window as unknown as { __book: Record<string, unknown> }).__book[`N1:${r}`], rank) as Promise<NetworkPuzzle>;

async function openLead(page: Page, rank: RegExp) {
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('radiogroup', { name: 'Difficulty' }).getByRole('radio', { name: rank }).click();
  await page.getByRole('button', { name: 'Open the case' }).click();
  await page.getByRole('button', { name: 'Go to the evidence board' }).click();
  await page.locator('article.lead', { hasText: 'N1' }).getByRole('button').click();
  await clearDialogs(page);
}

test('a network lead: decide every pair, mark the witnesses, close the lead', async ({ page }) => {
  await openLead(page, /Junior/);
  const p = await puzzleOf(page, 'junior');
  await expect(page.getByRole('heading', { name: 'Who called whom' })).toBeVisible();
  const stmts = page.locator('ul.stmts > li.stmt:not(.paid)');
  await expect(stmts).toHaveCount(p.statements.length);

  await page.getByRole('button', { name: 'Close this lead' }).click();
  await expect(page.locator('.msg')).toContainText('Some pairs are still undecided');

  const rows = page.locator('ul.pairs > li.pair');
  await expect(rows).toHaveCount(pairs(p.size).length);
  // a wrong answer is caught
  const first = p.links[0] ? 'Never' : 'In contact';
  await rows.nth(0).getByRole('button', { name: first, exact: true }).click();
  for (let k = 1; k < p.links.length; k++) await rows.nth(k).getByRole('button', { name: p.links[k] ? 'In contact' : 'Never', exact: true }).click();
  await page.getByRole('button', { name: 'Close this lead' }).click();
  await expect(page.locator('.msg')).toContainText('decided the wrong way');
  // fix it; choosing the right answer replaces the wrong one
  await rows.nth(0).getByRole('button', { name: p.links[0] ? 'In contact' : 'Never', exact: true }).click();

  // the counts match once every contact is found
  await expect(page.locator('ul.counts li.full')).toHaveCount(p.size);

  await page.getByRole('button', { name: 'Close this lead' }).click();
  await expect(page.locator('.msg')).toContainText('Mark every statement');
  for (let i = 0; i < p.statements.length; i++) await stmts.nth(i).getByRole('button', { name: p.truth[i] ? 'True' : 'Lie', exact: true }).click();
  await page.getByRole('button', { name: 'Close this lead' }).click();
  await expect(page.getByRole('dialog')).toContainText('Lead closed');
});

test('every rank has its own network, and the screen has no accessibility problems', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one browser is enough');
  await openLead(page, /Chief/);
  const p = await puzzleOf(page, 'chief');
  expect(p.size).toBe(7);
  await expect(page.locator('ul.pairs > li.pair')).toHaveCount(21);
  const results = await new AxeBuilder({ page: page as unknown as AxePage }).analyze();
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});
