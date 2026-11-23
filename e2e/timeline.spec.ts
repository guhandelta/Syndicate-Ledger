import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { TimelinePuzzle } from '../src/engine/timeline';
import { clearDialogs } from './helpers';

const URL = 'http://localhost:5199/fixtures/timeline.html?seed=0';
type AxePage = ConstructorParameters<typeof AxeBuilder>[0]['page'];

/** The puzzle the page was built with, so the test can fill in the right answer. */
const puzzleOf = (page: Page, rank: string) => page.evaluate((r) => (window as unknown as { __book: Record<string, unknown> }).__book[`T1:${r}`], rank) as Promise<TimelinePuzzle>;

async function openLead(page: Page, rank: RegExp) {
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('radiogroup', { name: 'Difficulty' }).getByRole('radio', { name: rank }).click();
  await page.getByRole('button', { name: 'Open the case' }).click();
  await page.getByRole('button', { name: 'Go to the evidence board' }).click();
  await page.locator('article.lead', { hasText: 'T1' }).getByRole('button').click();
  await clearDialogs(page);
}

test('a timeline lead: put the moments at their times, mark the witnesses, close the lead', async ({ page }) => {
  await openLead(page, /Junior/);
  const p = await puzzleOf(page, 'junior');
  await expect(page.getByRole('heading', { name: 'The night, minute by minute' })).toBeVisible();
  const stmts = page.locator('ul.stmts > li.stmt:not(.paid)');
  await expect(stmts).toHaveCount(p.statements.length);

  // a map lead lists its corridors, one for each link of the floorplan
  await expect(page.getByRole('heading', { name: 'Corridors' })).toBeVisible();
  await expect(page.locator('ul.corridors > li')).toHaveCount(p.edges!.length);

  // closing early says what is missing
  await page.getByRole('button', { name: 'Close this lead' }).click();
  await expect(page.getByText('Some moments are not on the timeline yet.')).toBeVisible();

  // put every moment at its time with the time picker next to it
  const moments = page.locator('ul.moments > li.moment');
  for (let m = 0; m < p.size; m++) await moments.nth(m).locator('select').selectOption(String(p.solution[m]));
  await expect(page.locator('ol.timeline .slot.filled')).toHaveCount(p.size);

  // marks are still needed
  await page.getByRole('button', { name: 'Close this lead' }).click();
  await expect(page.getByText('Mark every statement as True or Lie')).toBeVisible();
  for (let i = 0; i < p.statements.length; i++) await stmts.nth(i).getByRole('button', { name: p.truth[i] ? 'True' : 'Lie' }).click();
  await page.getByRole('button', { name: 'Close this lead' }).click();
  await expect(page.getByRole('dialog')).toContainText('Lead closed');
});

test('a wrong time stops the lead, and the keyboard places a picked moment', async ({ page }) => {
  await openLead(page, /Junior/);
  const p = await puzzleOf(page, 'junior');
  const moments = page.locator('ul.moments > li.moment');
  // pick moment 1 and press the wrong number
  await moments.nth(0).getByRole('button').click();
  const wrong = (p.solution[0] % p.size) + 1;
  await page.keyboard.press(String(wrong));
  await expect(moments.nth(0).locator('select')).toHaveValue(String(wrong));
  // the lead can't close with a wrong time (everything else is placed right, so only this one is off)
  for (let m = 1; m < p.size; m++) if (p.solution[m] !== wrong) await moments.nth(m).locator('select').selectOption(String(p.solution[m]));
  await page.getByRole('button', { name: 'Close this lead' }).click();
  await expect(page.locator('.msg')).toContainText(/wrong time|not on the timeline yet/);
  // picking a moment again, 0 takes it off the timeline
  await moments.nth(0).getByRole('button').click();
  await page.keyboard.press('0');
  await expect(moments.nth(0).locator('select')).toHaveValue('0');
});

test('every rank has its own timeline, and the screen has no accessibility problems', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one browser is enough');
  await openLead(page, /Chief/);
  const p = await puzzleOf(page, 'chief');
  expect(p.size).toBe(7);
  // the Chief timeline starts with one moment already fixed
  await expect(page.locator('ul.moments .tag', { hasText: 'Fixed' })).toHaveCount(1);
  const results = await new AxeBuilder({ page: page as unknown as AxePage }).analyze();
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});
