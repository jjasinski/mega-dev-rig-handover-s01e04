import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNight, RunStatus } from './types.js';

type Run = { at: string; job: string; status: RunStatus; owner: string | null; error?: string };

function isRun(value: unknown): value is Run {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.at === 'string' && Number.isFinite(Date.parse(row.at)) &&
    typeof row.job === 'string' && row.job.length > 0 &&
    (row.status === 'ok' || row.status === 'retry' || row.status === 'fail') &&
    (typeof row.owner === 'string' || row.owner === null) &&
    (row.error === undefined || typeof row.error === 'string');
}

export const readNight: ReadNight = (runsDir, night) => {
  // Only night files can be requested, and a path supplied by a route cannot escape runsDir.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;
  let contents: string;
  try {
    contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }

  const rows = new Map<string, DigestRow>();
  const errorTimes = new Map<string, number>();
  const counts = { ok: 0, retry: 0, fail: 0 };
  let badLines = 0;
  const lines = contents.split(/\r?\n/);
  if (lines[lines.length - 1] === '') lines.pop();
  for (const line of lines) {
    let data: unknown;
    try { data = JSON.parse(line); } catch { badLines++; continue; }
    if (!isRun(data)) { badLines++; continue; }
    counts[data.status]++;
    const current = rows.get(data.job);
    if (!current) {
      rows.set(data.job, {
        job: data.job, owner: data.owner, runs: 1, retries: Number(data.status === 'retry'),
        lastStatus: data.status, lastError: data.error ?? null, firstAt: data.at, lastAt: data.at,
      });
      if (data.error !== undefined) errorTimes.set(data.job, Date.parse(data.at));
      continue;
    }
    current.runs++;
    if (data.status === 'retry') current.retries++;
    if (Date.parse(data.at) < Date.parse(current.firstAt)) current.firstAt = data.at;
    if (Date.parse(data.at) >= Date.parse(current.lastAt)) {
      current.lastAt = data.at;
      current.lastStatus = data.status;
      current.owner = data.owner;
    }
    // Capture the latest error even if a later successful run has no error.
    if (data.error !== undefined) {
      const previousError = errorTimes.get(data.job);
      if (previousError === undefined || Date.parse(data.at) >= previousError) {
        current.lastError = data.error;
        errorTimes.set(data.job, Date.parse(data.at));
      }
    }
  }
  return { rows: [...rows.values()].sort((a, b) => a.job.localeCompare(b.job)), badLines, counts };
};
