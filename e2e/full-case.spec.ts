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
    await page.getByRole('dialog').getByRole('button', { name: 'Accuse', exact: true }).click();
    const fullBust = cf.endings.find((e) => e.id === 'full-bust')!;
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(t(fullBust.title, PRESET_RULES[preset].tone));
    await expect(page.getByLabel('3 of 3 stars')).toBeVisible();
  });
}
