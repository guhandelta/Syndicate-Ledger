import { expect, test, type Page } from '@playwright/test';
import { FRESH_URL } from './helpers';

const save = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('syndicate-ledger:save:v1') ?? 'null'));

async function open(page: Page) {
  await page.goto(FRESH_URL);
  await page.getByRole('button', { name: 'Open the case' }).click();
  await page.getByRole('button', { name: 'Go to the evidence board' }).click({ timeout: 60_000 });
  await expect(page.getByRole('heading', { name: 'Leads' })).toBeVisible();
}

test('a new case builds its own puzzles, keeps them in the save and plays the same after a reload', async ({ page }) => {
  await open(page);
  const s = await save(page);
  expect(s.seed).toBeGreaterThan(0);
  expect(Object.keys(s.puzzles).sort()).toEqual(['J1:junior', 'J2:junior', 'J3:junior', 'J4:junior', 'J5:junior']);
  // a linked clue still quotes an earlier lead
  expect(s.puzzles['J2:junior'].statements.some((st: { via?: unknown }) => st.via)).toBe(true);
  await page.reload();
  // the address still names the board, so the reload lands on it
  await expect(page.getByRole('heading', { name: 'Leads' })).toBeVisible();
  expect((await save(page)).puzzles).toEqual(s.puzzles);
});

test('a browser that cannot run a worker plays the shipped puzzles', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { Worker?: unknown }).Worker = undefined;
  });
  await open(page);
  const s = await save(page);
  expect(s.seed).toBeUndefined();
  expect(s.puzzles).toBeUndefined();
});
