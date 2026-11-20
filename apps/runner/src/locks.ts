import type { Environment, EnvironmentLockDto, WaitingRunDto } from '@terraplan/shared';
import {
  encodeLockBusEvent,
  ENVIRONMENTS,
  envWaitKey,
  LOCKS_CHANNEL,
  LOCKS_SNAPSHOT_KEY,
  lockTimeoutMs,
} from '@terraplan/shared';
import type { ApprovalPolicy } from '@terraplan/shared';
import type { PrismaClient } from '@terraplan/shared/db';
import { Prisma } from '@terraplan/shared/db';
import type Redis from 'ioredis';

/**
 * Apply and destroy take an exclusive environment lock (Postgres PK).
 * Plans also take the lock so state stays consistent while a mutating run holds it.
 */
export function needsEnvironmentLock(_action: string): boolean {
  return true;
}

/**
 * Takes the environment lock for a run. The environment is the primary key of
 * EnvironmentLock, so the insert is atomic across any number of runners.
 * Re-acquiring a lock this run already holds (a retried job) succeeds.
 */
export async function acquireLock(
  prisma: PrismaClient,
  environment: Environment,
  runId: string,
): Promise<boolean> {
  try {
    await prisma.environmentLock.create({ data: { environment, runId } });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const current = await prisma.environmentLock.findUnique({ where: { environment } });
      return current?.runId === runId;
    }
    throw err;
  }
}

/** Default used when env config is missing. */
export const DEFAULT_LOCK_TIMEOUT_MS = 45 * 60_000;

/**
 * Frees locks held longer than the environment's lockTimeoutMin (or default)
 * and fails their runs, so an environment can't stay locked forever.
 */
export async function reapStaleLocks(prisma: PrismaClient): Promise<string[]> {
  const locks = await prisma.environmentLock.findMany({ include: { run: true } });
  const configs = await prisma.environmentConfig.findMany();
  const policyByEnv = new Map(
    configs.map((c) => [c.name, c.approvalPolicy as ApprovalPolicy | null]),
  );
  const released: string[] = [];

  for (const lock of locks) {
    const timeout = lockTimeoutMs(policyByEnv.get(lock.environment) ?? null);
    if (lock.acquiredAt.getTime() > Date.now() - timeout) continue;
    await prisma.$transaction([
      prisma.run.updateMany({
        where: { id: lock.runId, status: 'running' },
        data: {
          status: 'failed',
          error: 'Lock timed out; the runner stopped responding',
          finishedAt: new Date(),
        },
      }),
      prisma.environmentLock.deleteMany({
        where: { environment: lock.environment, runId: lock.runId },
      }),
    ]);
    released.push(lock.environment);
  }
  return released;
}

export async function releaseLock(prisma: PrismaClient, environment: Environment, runId: string) {
  await prisma.environmentLock.deleteMany({ where: { environment, runId } });
}

/** Build full lock DTOs including waiting queues from Redis + Postgres. */
export async function buildLockSnapshot(
  prisma: PrismaClient,
  redis: Redis,
): Promise<EnvironmentLockDto[]> {
  const locks = await prisma.environmentLock.findMany({ include: { run: true } });
  const waitingByEnv: Partial<Record<string, WaitingRunDto[]>> = {};

  await Promise.all(
    ENVIRONMENTS.map(async (environment) => {
      const ids = await redis.zrange(envWaitKey(environment), 0, 49);
      if (!ids.length) {
        waitingByEnv[environment] = [];
        return;
      }
      const runs = await prisma.run.findMany({
        where: { id: { in: ids }, status: { in: ['queued', 'waiting_approval'] } },
      });
      const byId = new Map(runs.map((r) => [r.id, r]));
      waitingByEnv[environment] = ids
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((r) => ({
          runId: r!.id,
          action: r!.action,
          branch: r!.branch,
          repository: r!.repository,
          triggeredBy: r!.triggeredBy,
          createdAt: r!.createdAt.toISOString(),
        }));
    }),
  );

  return ENVIRONMENTS.map((environment) => {
    const lock = locks.find((l) => l.environment === environment);
    return {
      environment,
      held: !!lock,
      runId: lock?.runId ?? null,
      action: lock?.run?.action ?? null,
      branch: lock?.run?.branch ?? null,
      repository: lock?.run?.repository ?? null,
      status: lock?.run?.status ?? null,
      holder: lock?.run?.triggeredBy ?? null,
      acquiredAt: lock?.acquiredAt ? lock.acquiredAt.toISOString() : null,
      startedAt: lock?.run?.startedAt ? lock.run.startedAt.toISOString() : null,
      waiting: waitingByEnv[environment] ?? [],
    };
  });
}

export async function publishLockEvent(
  prisma: PrismaClient,
  redis: Redis,
  type: 'snapshot' | 'acquired' | 'released' | 'waiting',
  environment?: Environment,
) {
  const locks = await buildLockSnapshot(prisma, redis);
  const event =
    type === 'snapshot'
      ? { type, locks }
      : { type, environment: environment!, locks };
  const payload = encodeLockBusEvent(event);
  await redis.set(LOCKS_SNAPSHOT_KEY, payload);
  await redis.publish(LOCKS_CHANNEL, payload);
}

/** Mark a run as waiting on an environment lock (Redis ordered set). */
export async function markWaiting(redis: Redis, environment: Environment, runId: string) {
  await redis.zadd(envWaitKey(environment), Date.now(), runId);
}

export async function clearWaiting(redis: Redis, environment: Environment, runId: string) {
  await redis.zrem(envWaitKey(environment), runId);
}
