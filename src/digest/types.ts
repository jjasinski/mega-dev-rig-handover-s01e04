/** Status reported by an individual run in a night's log. */
export type RunStatus = 'ok' | 'retry' | 'fail';

/** Aggregated runs for one job. Timestamps retain the offset from the log. */
export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

/** A successfully read night, including malformed-line and event counts. */
export type DigestNight = {
  rows: DigestRow[];
  badLines: number;
  counts: Record<RunStatus, number>;
};

/** readNight(runsDir, night): null means the night file does not exist. */
export type ReadNight = (runsDir: string, night: string) => DigestNight | null;
