import type { HealthCheck, HealthReport } from '@terraplan/shared';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

const startedAt = Date.now();

export async function GET() {
  const t0 = Date.now();
  let api: HealthCheck;
  try {
    const res = await fetch(new URL('/api/v1/health', env.API_INTERNAL_URL), {
      cache: 'no-store',
      signal: AbortSignal.timeout(3_000),
    });
    api = res.ok
      ? { status: 'ok', latencyMs: Date.now() - t0 }
      : { status: 'error', latencyMs: Date.now() - t0, error: `API responded ${res.status}` };
  } catch (err) {
    api = { status: 'error', error: err instanceof Error ? err.message : String(err) };
  }

  const report: HealthReport = {
    status: api.status === 'ok' ? 'ok' : 'degraded',
    service: 'web',
    version: process.env.npm_package_version ?? '0.1.0',
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
    checks: { api },
  };
  // The web server itself is up, so it answers 200 even when the API is down.
  return Response.json(report);
}
