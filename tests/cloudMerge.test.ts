import { describe, expect, it } from 'vitest';
import { fingerprint, mergeBundles, mergeProgress, parseBundle, pickBundle } from '../src/sync/merge';

const prog = (parts: Record<string, { ending: string; at: string }>) => JSON.stringify({ caseId: 'c', parts });

describe('cloud save merge', () => {
  it('picks only the game keys', () => {
    expect(pickBundle([['syndicate-ledger:save:v1', 'a'], ['other', 'b'], ['syndicate-ledger-sync:last', 'c']])).toEqual({ 'syndicate-ledger:save:v1': 'a' });
  });

  it('fingerprints the same save the same way, whatever the key order', () => {
    expect(fingerprint({ 'syndicate-ledger:a': '1', 'syndicate-ledger:b': '2' })).toBe(fingerprint({ 'syndicate-ledger:b': '2', 'syndicate-ledger:a': '1' }));
    expect(fingerprint({ 'syndicate-ledger:a': '1' })).not.toBe(fingerprint({ 'syndicate-ledger:a': '2' }));
  });

  it('unions solved ranks and keeps the later one when both solved the same rank', () => {
    const a = prog({ junior: { ending: 'x', at: '2026-01-01' }, detective: { ending: 'old', at: '2026-01-01' } });
    const b = prog({ detective: { ending: 'new', at: '2026-02-01' }, inspector: { ending: 'y', at: '2026-02-02' } });
    const m = JSON.parse(mergeProgress(a, b));
    expect(Object.keys(m.parts).sort()).toEqual(['detective', 'inspector', 'junior']);
    expect(m.parts.detective.ending).toBe('new');
    expect(JSON.parse(mergeProgress(b, a)).parts.detective.ending).toBe('new');
    expect(JSON.parse(mergeProgress(JSON.stringify({ parts: { r: { ending: 'x' } } }), prog({ r: { ending: 'y', at: '1' } }))).parts.r.ending).toBe('y');
    expect(JSON.parse(mergeProgress(prog({ detective: { ending: 'keep', at: '2026-03-01' } }), b)).parts.detective.ending).toBe('keep');
  });

  it('survives unreadable progress', () => {
    const good = prog({ junior: { ending: 'x', at: 'a' } });
    expect(mergeProgress('{', good)).toBe(good);
    expect(mergeProgress(good, '{')).toBe(good);
    expect(mergeProgress('{', '{')).toBe('{');
    expect(mergeProgress('{"parts":1}', good)).toBe(good);
    expect(JSON.parse(mergeProgress(prog({ r: { ending: 'x', at: '' } }), JSON.stringify({ parts: { r: { ending: 'y' } } }))).parts.r.ending).toBe('x');
  });

  it('merges bundles: progress unioned, other keys by who has unsynced changes', () => {
    const local = { 'syndicate-ledger:case:c': prog({ junior: { ending: 'x', at: '1' } }), 'syndicate-ledger:save:v1': 'local', 'syndicate-ledger:notes:c': 'mine' };
    const cloud = { 'syndicate-ledger:case:c': prog({ detective: { ending: 'y', at: '2' } }), 'syndicate-ledger:save:v1': 'cloud', 'syndicate-ledger:extra': 'only-cloud' };
    const dirty = mergeBundles(local, cloud, true);
    expect(dirty['syndicate-ledger:save:v1']).toBe('local');
    expect(dirty['syndicate-ledger:notes:c']).toBe('mine');
    expect(dirty['syndicate-ledger:extra']).toBe('only-cloud');
    expect(Object.keys(JSON.parse(dirty['syndicate-ledger:case:c']).parts).sort()).toEqual(['detective', 'junior']);
    expect(mergeBundles(local, cloud, false)['syndicate-ledger:save:v1']).toBe('cloud');
  });

  it('only accepts well-formed bundles from the cloud', () => {
    expect(parseBundle({ 'syndicate-ledger:a': 'x' })).toEqual({ 'syndicate-ledger:a': 'x' });
    expect(parseBundle(null)).toBeNull();
    expect(parseBundle([])).toBeNull();
    expect(parseBundle({ other: 'x' })).toBeNull();
    expect(parseBundle({ 'syndicate-ledger:a': 1 })).toBeNull();
  });
});
