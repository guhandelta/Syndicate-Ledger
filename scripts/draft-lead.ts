/**
 * Drafts a lead from a scene brief and prints it as JSON, ready to paste into a case file's `leads`.
 * Usage: npm run draft-lead -- scene.json [cases/case-01-harbor-ledger.json]
 */
import { readFileSync } from 'node:fs';
import type { CaseFile } from '../src/game/caseTypes';
import { draftLead, type SceneBrief } from '../src/game/scene';

const [sceneFile, caseFile = 'cases/case-01-harbor-ledger.json'] = process.argv.slice(2);
if (!sceneFile) {
  console.error('Usage: npm run draft-lead -- scene.json [case.json]');
  process.exit(1);
}
const cf: CaseFile = JSON.parse(readFileSync(caseFile, 'utf8'));
const scene: SceneBrief = JSON.parse(readFileSync(sceneFile, 'utf8'));
console.log(JSON.stringify(draftLead(cf, scene), null, 2));
