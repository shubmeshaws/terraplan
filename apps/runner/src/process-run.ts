import {
  artifactKey,
  BITBUCKET_NOTIFY_QUEUE,
  collectSecretValues,
  LOCK_RETRY_DELAY_MS,
  putArtifact,
  putArtifactFile,
  redactSecrets,
  redactScannedSecrets,
} from '@terraplan/shared';
import type { ArtifactStoreConfig, BitbucketNotifyJobData, RunJobData } from '@terraplan/shared';
import type { PrismaClient } from '@terraplan/shared/db';
import type { Job, Queue } from 'bullmq';
import { DelayedError } from 'bullmq';
import type Redis from 'ioredis';
import type { Executor } from './executors/types';
import {
  acquireLock,
  clearWaiting,
  markWaiting,
  needsEnvironmentLock,
  publishLockEvent,
  releaseLock,
} from './locks';
import type { RunLogPublisher } from './log-publisher';
import { logger } from './logger';
import { notifyRunFinished } from './notify';
import { env } from './env';

const FLUSH_INTERVAL_MS = 1_000;
const MAX_OUTPUT_CHARS = 500_000;

export async function processRun(
  job: Job<RunJobData>,
  token: string | undefined,
  prisma: PrismaClient,
  executor: Executor,
  notifyQueue: Queue<BitbucketNotifyJobData>,
  logBus: RunLogPublisher,
  artifacts: ArtifactStoreConfig,
  redis: Redis,
) {
  const { runId } = job.data;
  const run = await prisma.run.findUnique({ where: { id: runId } });
  if (!run) {
    logger.warn('run no longer exists, dropping job', { runId });
    return;
  }
  if (run.status !== 'queued') {
    logger.info('run is not queued, skipping', { runId, status: run.status });
    return;
  }

  if (needsEnvironmentLock(run.action)) {
    if (!(await acquireLock(prisma, run.environment, run.id))) {
      logger.debug('environment locked, queuing retry', {
        runId,
        environment: run.environment,
      });
      await markWaiting(redis, run.environment, run.id);
      await publishLockEvent(prisma, redis, 'waiting', run.environment);
      await job.moveToDelayed(Date.now() + LOCK_RETRY_DELAY_MS, token);
      throw new DelayedError();
    }
    await clearWaiting(redis, run.environment, run.id);
    await publishLockEvent(prisma, redis, 'acquired', run.environment);
  }

  const claimed = await prisma.run.updateMany({
    where: { id: run.id, status: 'queued' },
    data: { status: 'running', startedAt: new Date(), output: '' },
  });
  if (claimed.count === 0) {
    if (needsEnvironmentLock(run.action)) {
      await releaseLock(prisma, run.environment, run.id);
      await publishLockEvent(prisma, redis, 'released', run.environment);
    }
    return;
  }

  logger.info('run started', { runId, action: run.action, environment: run.environment });
  let output = '';
  let dirty = false;
  const knownSecrets: string[] = [];

  const flush = async () => {
    if (!dirty) return;
    dirty = false;
    await prisma.run.update({ where: { id: run.id }, data: { output } });
  };
  const timer = setInterval(() => flush().catch(() => {}), FLUSH_INTERVAL_MS);

  const emit = (chunk: string) => {
    const known = redactSecrets(chunk, knownSecrets);
    const { text: redacted } = redactScannedSecrets(known);
    output = (output + redacted).slice(-MAX_OUTPUT_CHARS);
    dirty = true;
    void logBus.publish(runId, { type: 'chunk', text: redacted });
  };

  let cleanup: (() => Promise<void>) | undefined;

  try {
    const timeoutMs = env.RUN_TIMEOUT_SECONDS * 1000;
    const result = await Promise.race([
      executor.execute(run, emit, {
        addSecret: (value) => {
          for (const s of collectSecretValues([value])) {
            if (!knownSecrets.includes(s)) knownSecrets.push(s);
          }
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Run timed out after ${env.RUN_TIMEOUT_SECONDS}s`)),
          timeoutMs,
        ),
      ),
    ]);
    knownSecrets.push(...collectSecretValues(result.secrets || []));
    output = redactSecrets(output, knownSecrets);
    cleanup = result.cleanup;

    const artifactKeys: {
      planFileKey?: string;
      planJsonKey?: string;
      logFileKey?: string;
    } = {};

    try {
      if (result.planFilePath) {
        const key = artifactKey(artifacts, runId, 'plan.tfplan');
        await putArtifactFile(artifacts, key, result.planFilePath, 'application/octet-stream');
        artifactKeys.planFileKey = key;
        emit(`# uploaded plan binary → ${key}\n`);
      }
      if (result.planJsonPath) {
        const key = artifactKey(artifacts, runId, 'plan.json');
        await putArtifactFile(artifacts, key, result.planJsonPath, 'application/json');
        artifactKeys.planJsonKey = key;
        emit(`# uploaded plan JSON → ${key}\n`);
      }
      // Apply reuses the source plan's keys when no new plan binary was staged.
      if (run.action === 'apply' && run.planFileKey && !artifactKeys.planFileKey) {
        artifactKeys.planFileKey = run.planFileKey;
        artifactKeys.planJsonKey = run.planJsonKey ?? undefined;
      }
      const logKey = artifactKey(artifacts, runId, 'run.log');
      await putArtifact(artifacts, logKey, output, 'text/plain; charset=utf-8');
      artifactKeys.logFileKey = logKey;
      emit(`# uploaded run log → ${logKey}\n`);
    } catch (err) {
      emit(`# artifact upload warning: ${err instanceof Error ? err.message : String(err)}\n`);
      logger.warn('artifact upload failed', {
        runId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    clearInterval(timer);
    await prisma.run.update({
      where: { id: run.id },
      data: {
        status: 'succeeded',
        output,
        commitSha: result.commitSha,
        planSummary: result.planSummary,
        terraformVersion: result.terraformVersion ?? null,
        planFileKey: artifactKeys.planFileKey ?? run.planFileKey,
        planJsonKey: artifactKeys.planJsonKey ?? run.planJsonKey,
        logFileKey: artifactKeys.logFileKey ?? null,
        finishedAt: new Date(),
      },
    });
    await logBus.publish(runId, { type: 'done', status: 'succeeded' });
    logger.info('run succeeded', { runId });
    void notifyRunFinished({
      slackUrl: env.SLACK_WEBHOOK_URL,
      teamsUrl: env.TEAMS_WEBHOOK_URL,
      notifyOn: env.NOTIFY_ON,
      status: 'succeeded',
      runId,
      action: run.action,
      environment: run.environment,
      repository: run.repository,
      branch: run.branch,
      triggeredBy: run.triggeredBy,
      planSummary: result.planSummary,
    });
  } catch (err) {
    clearInterval(timer);
    const message = redactSecrets(
      err instanceof Error ? err.message : String(err),
      knownSecrets,
    );
    output = redactSecrets(output, knownSecrets);

    try {
      const logKey = artifactKey(artifacts, runId, 'run.log');
      await putArtifact(
        artifacts,
        logKey,
        output + `\nERROR: ${message}\n`,
        'text/plain; charset=utf-8',
      );
      await prisma.run.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          output,
          error: message,
          logFileKey: logKey,
          finishedAt: new Date(),
        },
      });
    } catch {
      await prisma.run.update({
        where: { id: run.id },
        data: { status: 'failed', output, error: message, finishedAt: new Date() },
      });
    }
    await logBus.publish(runId, { type: 'done', status: 'failed' });
    logger.warn('run failed', { runId, error: message });
    void notifyRunFinished({
      slackUrl: env.SLACK_WEBHOOK_URL,
      teamsUrl: env.TEAMS_WEBHOOK_URL,
      notifyOn: env.NOTIFY_ON,
      status: 'failed',
      runId,
      action: run.action,
      environment: run.environment,
      repository: run.repository,
      branch: run.branch,
      triggeredBy: run.triggeredBy,
      error: message,
    });
  } finally {
    clearInterval(timer);
    if (cleanup) await cleanup().catch(() => {});
    if (needsEnvironmentLock(run.action)) {
      await releaseLock(prisma, run.environment, run.id);
      await clearWaiting(redis, run.environment, run.id);
      await publishLockEvent(prisma, redis, 'released', run.environment);
    }
  }

  if (run.action === 'plan' && run.pullRequestId) {
    try {
      await notifyQueue.add(
        'pr-comment',
        { runId },
        { jobId: `notify-${runId}`, attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
      );
      logger.info('enqueued Bitbucket PR comment', { runId, queue: BITBUCKET_NOTIFY_QUEUE });
    } catch (err) {
      logger.warn('could not enqueue PR comment', {
        runId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
