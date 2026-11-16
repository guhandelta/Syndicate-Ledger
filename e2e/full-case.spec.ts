import { expect, test } from '@playwright/test';
import { PRESETS } from '../src/game/caseTypes';
import { t } from '../src/game/text';
import { PRESET_RULES } from '../src/game/presets';
import { GAME_URL, caseFor, cf, clearDialogs, solveLead, startCase, unlockUpTo } from './helpers';

// Rule book section 8: the full bust is reachable on the default clock without informants, at every preset.
for (const preset of PRESETS) {
  test(`plays Case 1 to the full bust at ${preset}`, async ({ page }) => {
    await startCase(page, preset);
    const story = caseFor(preset);
    const boss = story.endings.find((e) => e.id === 'full-bust')!.accuse[0];
    for (const lead of story.leads) {
      await solveLead(page, preset, lead.id);
      // a finale's first step offers to go straight on; the test comes back to the board and opens the next lead itself
      await clearDialogs(page, { 'wants a word': 'Decline', 'Lead closed: Where': 'Later' });
      await expect(page.locator('article.lead', { hasText: lead.id }).locator('.lead-state')).toHaveText('✓ Solved');
    }
    await page.getByRole('button', { name: 'Make an accusation' }).click();
    await page.getByRole('button', { name: new RegExp(cf.cast.find((c) => c.id === boss)!.name) }).click();
    for (const id of story.proof![boss].needs) await page.getByLabel(t(story.leads.find((l) => l.id === id)!.title, PRESET_RULES[preset].tone)).check();
    await page.getByRole('button', { name: 'Make the accusation' }).click();
    const fullBust = story.endings.find((e) => e.id === 'full-bust')!;
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(t(fullBust.title, PRESET_RULES[preset].tone));
    await expect(page.getByLabel('3 of 3 stars')).toBeVisible();
    // the full bust uncovers this rank's part of the case, kept apart from the game save
    const progress = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), `syndicate-ledger:case:${cf.id}`);
    expect(Object.keys(progress.parts)).toEqual(PRESETS.slice(0, PRESETS.indexOf(preset) + 1));
    expect(progress.parts[preset].ending).toBe('full-bust');
    await expect(page.getByRole('heading', { name: /^Part uncovered:/ })).toBeVisible();
    // Junior and Detective hand over to the next rank with a scene after the part is uncovered
    const next: Record<string, string> = { junior: 'CS-9', detective: 'gate book' };
    if (next[preset]) await expect(page.getByLabel('After the case')).toContainText(next[preset]);
    else await expect(page.getByLabel('After the case')).toHaveCount(0);
  });
}

test('Detective opens with the police desk scene, the carried plate and changed greetings', async ({ page }) => {
  await page.goto(GAME_URL);
  await unlockUpTo(page, 'detective');
  await page.getByRole('radio', { name: /Detective/ }).click();
  await page.getByRole('button', { name: 'Open the case' }).click();
  await expect(page.getByLabel('The briefing')).toContainText('Who did it?');
  await page.getByRole('button', { name: 'Go to the evidence board' }).click();
  await expect(page.locator('.facts .carried').first()).toContainText('The stamped plate');
  await expect(page.locator('.facts .carried').first()).toContainText('From the Junior case');
  await expect(page.locator('.facts .carried').nth(1)).toContainText('What changed');
  await expect(page.locator('.facts .carried').nth(2)).toContainText('Still unanswered');
});

test('a right name with weak proof is refused and costs a try', async ({ page }) => {
  await startCase(page, 'inspector');
  for (const lead of cf.leads) {
    await solveLead(page, 'inspector', lead.id);
    await clearDialogs(page, { 'wants a word': 'Decline' });
  }
  await page.getByRole('button', { name: 'Make an accusation' }).click();
  await page.getByRole('button', { name: /Silas Crane/ }).click();
  await page.getByLabel(t(cf.leads[0].title, PRESET_RULES.inspector.tone)).check();
  await page.getByRole('button', { name: 'Make the accusation' }).click();
  await expect(page.getByRole('dialog')).toContainText('Not proven');
  await expect(page.getByRole('dialog')).toContainText('1 try left');
});
