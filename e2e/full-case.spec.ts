import { expect, test } from '@playwright/test';
import { PRESETS } from '../src/game/caseTypes';
import { t } from '../src/game/text';
import { PRESET_RULES } from '../src/game/presets';
import { cf, clearDialogs, solveLead, startCase } from './helpers';

// Rule book section 8: the full bust is reachable on the default clock without informants, at every preset.
for (const preset of PRESETS) {
  test(`plays Case 1 to the full bust at ${preset}`, async ({ page }) => {
    await startCase(page, preset);
    for (const lead of cf.leads) {
      await solveLead(page, preset, lead.id);
      await clearDialogs(page, { 'wants a word': 'Decline' });
      await expect(page.locator('article.lead', { hasText: lead.id }).locator('.lead-state')).toHaveText('✓ Solved');
    }
    await page.getByRole('button', { name: 'Make an accusation' }).click();
    await page.getByRole('button', { name: /Silas Crane/ }).click();
    for (const id of cf.proof!.crane.needs) await page.getByLabel(t(cf.leads.find((l) => l.id === id)!.title, PRESET_RULES[preset].tone)).check();
    await page.getByRole('button', { name: 'Make the accusation' }).click();
    const fullBust = cf.endings.find((e) => e.id === 'full-bust')!;
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(t(fullBust.title, PRESET_RULES[preset].tone));
    await expect(page.getByLabel('3 of 3 stars')).toBeVisible();
  });
}

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
