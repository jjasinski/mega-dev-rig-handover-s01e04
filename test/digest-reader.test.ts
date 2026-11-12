import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read-night.js';

const dirs: string[] = [];
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  dirs.push(dir);
  return dir;
}
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe('readNight', () => {
  it('aggregates the sample night, preserving errors and null owners', () => {
    const night = readNight('runs', '2026-10-28');
    expect(night?.badLines).toBe(1);
    expect(night?.rows).toHaveLength(5);
    expect(night?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
    expect(night?.rows.map(row => row.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
    expect(night?.rows.find(row => row.job === 'digest/render')?.owner).toBeNull();
    expect(night?.rows.find(row => row.job === 'fixtures/refresh')).toMatchObject({
      runs: 4, retries: 3, lastStatus: 'ok', lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('distinguishes a missing file from an empty night and rejects path traversal', () => {
    const dir = tempDir();
    expect(readNight(dir, '2026-10-01')).toBeNull();
    expect(readNight(dir, '../secret')).toBeNull();
    writeFileSync(join(dir, '2026-10-01.jsonl'), '');
    expect(readNight(dir, '2026-10-01')).toEqual({ rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
  });

  it('counts malformed records and orders timestamps even when lines are out of order', () => {
    const dir = tempDir();
    const events = [
      { at: '2026-10-01T02:00:00+02:00', job: 'job', status: 'ok', owner: null },
      { at: '2026-10-01T00:00:00+02:00', job: 'job', status: 'retry', owner: 'first', error: 'late start' },
      { at: '2026-10-01T01:00:00+02:00', job: 'job', status: 'fail', owner: 'first', error: 'failed' },
    ];
    writeFileSync(join(dir, '2026-10-01.jsonl'), events.map(event => JSON.stringify(event)).join('\n') + '\n{\n{}\n');
    const night = readNight(dir, '2026-10-01');
    expect(night?.badLines).toBe(2);
    expect(night?.rows[0]).toEqual({
      job: 'job', owner: null, runs: 3, retries: 1, lastStatus: 'ok', lastError: 'failed',
      firstAt: '2026-10-01T00:00:00+02:00', lastAt: '2026-10-01T02:00:00+02:00',
    });
  });
});
