import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const night = '2026-10-28';
let runsDir: string;

beforeEach(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-routes-'));
});

afterEach(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

function app() {
  return createApp({ adapter: 'test', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });
}

function writeNight(contents: string) {
  writeFileSync(join(runsDir, `${night}.jsonl`), contents);
}

const entry = (job: string, status: 'ok' | 'retry' | 'fail', at: string, owner: string | null, error?: string) =>
  JSON.stringify({ at, job, status, owner, ...(error ? { error } : {}) });

describe('digest routes', () => {
  it('returns the same alphabetically sorted jobs on the page and in JSON', async () => {
    writeNight([
      entry('zebra', 'fail', '2026-10-28T06:30:00+01:00', null, 'failed to run'),
      entry('alpha', 'ok', '2026-10-28T05:10:00+01:00', 'Ada'),
    ].join('\n'));

    const instance = app();
    const page = await instance.request(`/digest/${night}`);
    const api = await instance.request(`/api/digest/${night}`);
    expect(page.status).toBe(200);
    expect(api.status).toBe(200);
    const html = await page.text();
    const rows = await api.json() as Array<{ job: string }>;
    expect(rows.map((row) => row.job)).toEqual(['alpha', 'zebra']);
    expect(html.indexOf('alpha')).toBeGreaterThan(-1);
    expect(html.indexOf('zebra')).toBeGreaterThan(html.indexOf('alpha'));
    expect(html).toContain('failed to run');
    expect(html).toContain('—');
  });

  it.each(['/digest/', '/api/digest/'])('returns 404 for a missing night at %s', async (route) => {
    expect((await app().request(`${route}${night}`)).status).toBe(404);
  });

  it('renders an empty night and returns no JSON rows', async () => {
    writeNight('');
    const instance = app();
    const page = await instance.request(`/digest/${night}`);
    const api = await instance.request(`/api/digest/${night}`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('nothing ran');
    expect(api.status).toBe(200);
    expect(await api.json()).toEqual([]);
  });

  it('keeps rendering valid jobs when a line is malformed', async () => {
    writeNight(`${entry('alpha', 'ok', '2026-10-28T05:10:00+01:00', 'Ada')}\n{bad json\n`);
    const instance = app();
    const page = await instance.request(`/digest/${night}`);
    const api = await instance.request(`/api/digest/${night}`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('unreadable lines: 1');
    expect(api.status).toBe(200);
    const rows = await api.json() as Array<{ job: string }>;
    expect(rows.map((row) => row.job)).toEqual(['alpha']);
  });
});
