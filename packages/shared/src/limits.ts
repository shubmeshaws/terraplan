/**
 * Platform guardrails: rate limits, per-user concurrency, and run timeouts.
 * Values are also mirrored in env schemas; this module is the typed default source.
 */

export const DEFAULT_RATE_LIMIT_RUNS_PER_HOUR = 30;
export const DEFAULT_USER_MAX_CONCURRENT_RUNS = 3;
export const DEFAULT_RUN_TIMEOUT_SECONDS = 3600;

export interface PlatformLimits {
  rateLimitRunsPerHour: number;
  userMaxConcurrentRuns: number;
  runTimeoutSeconds: number;
}

export function platformLimitsFromEnv(env: {
  RATE_LIMIT_RUNS_PER_HOUR?: number;
  USER_MAX_CONCURRENT_RUNS?: number;
  RUN_TIMEOUT_SECONDS?: number;
}): PlatformLimits {
  return {
    rateLimitRunsPerHour: env.RATE_LIMIT_RUNS_PER_HOUR ?? DEFAULT_RATE_LIMIT_RUNS_PER_HOUR,
    userMaxConcurrentRuns: env.USER_MAX_CONCURRENT_RUNS ?? DEFAULT_USER_MAX_CONCURRENT_RUNS,
    runTimeoutSeconds: env.RUN_TIMEOUT_SECONDS ?? DEFAULT_RUN_TIMEOUT_SECONDS,
  };
}

/** Redis key helpers for rate / concurrency tracking. */
export const limitKeys = {
  rateHour: (userId: string, hourBucket: string) => `terraplan:rl:runs:${userId}:${hourBucket}`,
  concurrent: (userId: string) => `terraplan:cc:runs:${userId}`,
};

export function currentHourBucket(now = new Date()): string {
  return now.toISOString().slice(0, 13); // YYYY-MM-DDTHH
}
