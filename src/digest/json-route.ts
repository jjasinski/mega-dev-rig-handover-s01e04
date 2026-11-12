import { Hono } from 'hono';
import { readNight } from './read-night.js';

/** The API and HTML routes consume the same reader; JSON exposes the same job rows. */
export function createDigestJsonRoutes(runsDir: string): Hono {
  const app = new Hono();

  app.get('/api/digest/:night', (c) => {
    const digest = readNight(runsDir, c.req.param('night'));
    if (digest === null) return c.notFound();

    return c.json(digest.rows.toSorted((a, b) => a.job.localeCompare(b.job)));
  });

  return app;
}
