import { expect, type Page } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { PRESETS, type CaseFile, type Preset } from '../src/game/caseTypes';
import type { CipherPuzzle } from '../src/engine/cipher';
import type { NetworkPuzzle } from '../src/engine/network';
import type { StakeoutPuzzle } from '../src/engine/stakeout';
import type { TimelinePuzzle } from '../src/engine/timeline';
import type { GeneratedPuzzle } from '../src/engine/types';
import { caseForRank } from '../src/game/rankStory';

const readJson = (file: string) => JSON.parse(readFileSync(path.resolve(file), 'utf8'));
export const cf = readJson('cases/case-01-harbor-ledger.json') as CaseFile;
export const book = readJson('cases/case-01-harbor-ledger/puzzles.json') as Record<string, GeneratedPuzzle | TimelinePuzzle | NetworkPuzzle | CipherPuzzle | StakeoutPuzzle>;
/** The case as one rank plays it: its own story's leads, proof and endings. */
export const caseFor = (preset: Preset) => caseForRank(cf, preset);
// the e2e plays the shipped puzzles (seed 0), because its solver reads them from puzzles.json; a test of fresh puzzles opens GAME_URL without it
export const GAME_URL = `${pathToFileURL(path.resolve('dist/syndicate-ledger.html')).href}?seed=0`;
export const FRESH_URL = pathToFileURL(path.resolve('dist/syndicate-ledger.html')).href;

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

/** Ranks open in order, so playing a higher rank needs the parts below it uncovered first. */
export async function unlockUpTo(page: Page, preset: Preset) {
  const below = PRESETS.slice(0, PRESETS.indexOf(preset));
  const parts = Object.fromEntries(below.map((r) => [r, { ending: 'full-bust', at: '2026-11-16T00:00:00Z', character: 'detective' }]));
  await page.evaluate(
    ([key, value]) => localStorage.setItem(key, value),
    [`syndicate-ledger:case:${cf.id}`, JSON.stringify({ caseId: cf.id, parts })],
  );
  await page.reload();
}

export async function startCase(page: Page, preset: Preset) {
  await page.goto(GAME_URL);
  if (preset !== 'junior') await unlockUpTo(page, preset);
  await page.getByRole('radio', { name: new RegExp(PRESET_LABEL[preset]) }).click();
  await page.getByRole('button', { name: 'Open the case' }).click();
  await page.getByRole('button', { name: 'Go to the evidence board' }).click();
  await expect(page.getByRole('heading', { name: 'Leads' })).toBeVisible();
}

/** Opens a lead from the board, fills in its solution, marks every statement and closes it. */
export async function solveLead(page: Page, preset: Preset, leadId: string) {
  const card = page.locator('article.lead', { has: page.locator('.lead-id', { hasText: leadId }) });
  await card.getByRole('button').click();
  await clearDialogs(page);
  const p = book[`${leadId}:${preset}`];
  if (p.type === 'timeline') {
    const moments = page.locator('ul.moments > li.moment');
    for (let m = 0; m < p.size; m++) if (!p.givens.some((g) => g.m === m)) await moments.nth(m).locator('select').selectOption(String(p.solution[m]));
  } else if (p.type === 'network') {
    const rows = page.locator('ul.pairs > li.pair');
    for (let k = 0; k < p.links.length; k++) await rows.nth(k).getByRole('button', { name: p.links[k] ? 'In contact' : 'Never', exact: true }).click();
  } else if (p.type === 'stakeout') {
    for (let r = 0; r < p.size; r++) if (!p.givens.some((g) => g.r === r)) await page.locator(`[data-stake="${r}-${p.cols[r]}"]`).click();
  } else if (p.type === 'cipher') {
    const slots = page.locator('ol.code > li.code-slot');
    for (let k = 0; k < p.size; k++) await slots.nth(k).locator('select').selectOption(String(p.code[k]));
  } else {
    const rows = page.locator('table.grid tbody tr');
    const given = new Set(p.givens.map((g) => `${g.cell[0]},${g.cell[1]}`));
    for (let r = 0; r < p.size; r++)
      for (let c = 0; c < p.size; c++) {
        if (given.has(`${r},${c}`)) continue;
        await rows.nth(r).locator('td').nth(c).click();
        await page.keyboard.press(String(p.solution[r][c]));
      }
  }
  const stmts = page.locator('ul.stmts > li.stmt:not(.paid)');
  await expect(stmts).toHaveCount(p.statements.length);
  for (let i = 0; i < p.statements.length; i++)
    await stmts.nth(i).getByRole('button', { name: p.truth[i] ? 'True' : 'Lie', exact: true }).click();
  await page.getByRole('button', { name: 'Close this lead' }).click();
  await expect(page.getByRole('dialog').getByRole('heading')).toContainText('Lead closed');
}
