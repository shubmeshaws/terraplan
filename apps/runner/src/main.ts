import { createServer } from 'node:http';
import {
  BITBUCKET_NOTIFY_QUEUE,
  pingRedis,
  redisConnectionFromUrl,
  RUN_QUEUE,
} from '@terraplan/shared';
import type { ArtifactStoreConfig, BitbucketNotifyJobData, HealthReport, RunJobData } from '@terraplan/shared';
import { createPrismaClient } from '@terraplan/shared/db';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { env } from './env';
import { SimulatedExecutor } from './executors/simulated';
import { TerraformExecutor } from './executors/terraform';
import type { Executor } from './executors/types';
import { publishLockEvent, reapStaleLocks } from './locks';
import { RunLogPublisher } from './log-publisher';
import { logger } from './logger';
import { processRun } from './process-run';

const prisma = createPrismaClient();
const connection = redisConnectionFromUrl(env.REDIS_URL);
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const logBus = new RunLogPublisher(redis);

const artifacts: ArtifactStoreConfig = {
  bucket: env.ARTIFACTS_S3_BUCKET,
  region: env.ARTIFACTS_S3_REGION,
  prefix: env.ARTIFACTS_S3_PREFIX,
  localDir: env.ARTIFACTS_LOCAL_DIR,
};

const encryptionKeyMaterial = env.CREDENTIALS_ENCRYPTION_KEY || env.SESSION_SECRET;

const executor: Executor =
  env.RUNNER_MODE === 'terraform'
    ? new TerraformExecutor(prisma, {
        versionsDir: env.TERRAFORM_VERSIONS_DIR,
        workspacesDir: env.TERRAFORM_WORKSPACES_DIR,
        encryptionKeyMaterial,
        fallbackBin: env.TERRAFORM_BIN,
        artifacts,
        runTimeoutSeconds: env.RUN_TIMEOUT_SECONDS,
        deniedFlagsEnv: env.TF_DENIED_FLAGS,
        secretScanFailOnHigh: env.SECRET_SCAN_FAIL_ON_HIGH,
      })
    : new SimulatedExecutor();

const notifyQueue = new Queue<BitbucketNotifyJobData>(BITBUCKET_NOTIFY_QUEUE, { connection });

const worker = new Worker<RunJobData>(
  RUN_QUEUE,
  (job, token) =>
    processRun(job, token, prisma, executor, notifyQueue, logBus, artifacts, redis),
  {
    connection,
    concurrency: env.RUNNER_CONCURRENCY,
  },
);

worker.on('ready', () =>
  logger.info('runner ready', {
    queue: RUN_QUEUE,
    mode: env.RUNNER_MODE,
    concurrency: env.RUNNER_CONCURRENCY,
    artifacts: artifacts.bucket ? `s3://${artifacts.bucket}` : `local:${artifacts.localDir}`,
  }),
);
worker.on('failed', (job, err) =>
  logger.error('job crashed', { jobId: job?.id, error: err.message }),
);
worker.on('error', (err) => logger.error('worker error', { error: err.message }));

const reaper = setInterval(() => {
  reapStaleLocks(prisma)
    .then(async (envs) => {
      if (!envs.length) return;
      logger.warn('released stale locks', { environments: envs });
      await publishLockEvent(prisma, redis, 'snapshot');
    })
    .catch((err) => logger.error('stale lock reaper failed', { error: (err as Error).message }));
}, 60_000);

// Health endpoint: GET /health → 200 when Postgres and Redis are reachable.
const startedAt = Date.now();
const server = createServer(async (req, res) => {
  if (req.url !== '/health') {
    res.writeHead(404).end();
    return;
  }
  const check = async (fn: () => Promise<unknown>) => {
    const t0 = Date.now();
    try {
      await fn();
      return { status: 'ok' as const, latencyMs: Date.now() - t0 };
    } catch (err) {
      return {
        status: 'error' as const,
        latencyMs: Date.now() - t0,
        error: (err as Error).message,
      };
    }
  };
  const [database, redisCheck] = await Promise.all([
    check(() => prisma.$queryRaw`SELECT 1`),
    check(() => pingRedis(worker.client)),
  ]);
  const ok = database.status === 'ok' && redisCheck.status === 'ok' && worker.isRunning();
  const report: HealthReport = {
    status: ok ? 'ok' : 'degraded',
    service: 'runner',
    version: process.env.npm_package_version ?? '0.1.0',
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
    checks: { database, redis: redisCheck, worker: { status: worker.isRunning() ? 'ok' : 'error' } },
  };
  res.writeHead(ok ? 200 : 503, { 'content-type': 'application/json' }).end(JSON.stringify(report));
});
server.listen(env.RUNNER_HEALTH_PORT, () =>
  logger.info(`health endpoint on http://localhost:${env.RUNNER_HEALTH_PORT}/health`),
);

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('shutting down, waiting for active runs to finish', { signal });
  clearInterval(reaper);
  server.close();
  await worker.close();
  await notifyQueue.close();
  await redis.quit().catch(() => {});
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
