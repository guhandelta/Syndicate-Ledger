import { expect, type Page } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import type { CaseFile, Preset, PuzzleBook } from '../src/game/caseTypes';

const readJson = (file: string) => JSON.parse(readFileSync(path.resolve(file), 'utf8'));
export const cf = readJson('cases/case-01-harbor-ledger.json') as CaseFile;
export const book = readJson('cases/case-01-harbor-ledger/puzzles.json') as PuzzleBook;
export const GAME_URL = pathToFileURL(path.resolve('dist/syndicate-ledger.html')).href;

export const PRESET_LABEL: Record<Preset, string> = { junior: 'Junior', detective: 'Detective', inspector: 'Inspector', chief: 'Chief' };

/** Clicks the primary button of every open dialog until none is left (news, offers, lead closed). */
export async function clearDialogs(page: Page, answers: Record<string, string> = {}) {
  const dialog = page.getByRole('dialog');
  while (await dialog.isVisible()) {
    const title = (await dialog.getByRole('heading').textContent()) ?? '';
    const pick = Object.entries(answers).find(([k]) => title.includes(k))?.[1];
    const button = pick ? dialog.getByRole('button', { name: pick, exact: true }) : dialog.locator('.btn.primary');
    await button.click();
  }
}

export async function startCase(page: Page, preset: Preset) {
  await page.goto(GAME_URL);
  await page.getByRole('radio', { name: new RegExp(PRESET_LABEL[preset]) }).click();
  await page.getByRole('button', { name: /Open the case|Start over/ }).click();
  await page.getByRole('button', { name: 'Go to the evidence board' }).click();
  await expect(page.getByRole('heading', { name: 'Leads' })).toBeVisible();
}

/** Opens a lead from the board, fills in its solution, marks every statement and closes it. */
export async function solveLead(page: Page, preset: Preset, leadId: string) {
  const card = page.locator('article.lead', { has: page.locator('.lead-id', { hasText: leadId }) });
  await card.getByRole('button').click();
  await clearDialogs(page);
  const p = book[`${leadId}:${preset}`];
  const rows = page.locator('table.grid tbody tr');
  const given = new Set(p.givens.map((g) => `${g.cell[0]},${g.cell[1]}`));
  for (let r = 0; r < p.size; r++)
    for (let c = 0; c < p.size; c++) {
      if (given.has(`${r},${c}`)) continue;
      await rows.nth(r).locator('td').nth(c).click();
      await page.keyboard.press(String(p.solution[r][c]));
    }
  const stmts = page.locator('ul.stmts > li.stmt:not(.paid)');
  await expect(stmts).toHaveCount(p.statements.length);
  for (let i = 0; i < p.statements.length; i++)
    await stmts.nth(i).getByRole('button', { name: p.truth[i] ? 'True' : 'Lie', exact: true }).click();
  await page.getByRole('button', { name: 'Close this lead' }).click();
  await expect(page.getByRole('dialog').getByRole('heading')).toContainText('Lead closed');
}
