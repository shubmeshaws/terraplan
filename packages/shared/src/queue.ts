export const RUN_QUEUE = 'terraform-runs';
export const BITBUCKET_NOTIFY_QUEUE = 'bitbucket-notify';

export interface RunJobData {
  runId: string;
}

export interface BitbucketNotifyJobData {
  runId: string;
}

/**
 * One job id per run so a run can never be enqueued twice.
 * BullMQ rejects custom ids containing ':'.
 */
export const runJobId = (runId: string) => `run-${runId}`;

/** How long a worker waits before re-checking a busy environment lock. */
export const LOCK_RETRY_DELAY_MS = 5_000;

/** BullMQ types its connection loosely; this is the slice the health checks need. */
export async function pingRedis(client: Promise<unknown>): Promise<string> {
  return ((await client) as { ping(): Promise<string> }).ping();
}

/**
 * Parses a redis:// URL into the connection options BullMQ/ioredis expect.
 * BullMQ workers require `maxRetriesPerRequest: null`.
 */
export function redisConnectionFromUrl(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: u.pathname && u.pathname !== '/' ? Number(u.pathname.slice(1)) : 0,
    tls: u.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}
