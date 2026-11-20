import type { OnModuleDestroy } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { BitbucketNotifyJobData, RunJobData } from '@terraplan/shared';
import {
  BITBUCKET_NOTIFY_QUEUE,
  pingRedis,
  redisConnectionFromUrl,
  RUN_QUEUE,
  runJobId,
} from '@terraplan/shared';
import { Queue } from 'bullmq';
import { env } from '../env';

@Injectable()
export class RunQueueService implements OnModuleDestroy {
  private readonly connection = redisConnectionFromUrl(env.REDIS_URL);

  private readonly queue = new Queue<RunJobData>(RUN_QUEUE, {
    connection: this.connection,
    defaultJobOptions: {
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  });

  private readonly notifyQueue = new Queue<BitbucketNotifyJobData>(BITBUCKET_NOTIFY_QUEUE, {
    connection: this.connection,
    defaultJobOptions: {
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    },
  });

  async enqueue(runId: string) {
    await this.queue.add('run', { runId }, { jobId: runJobId(runId) });
  }

  async enqueuePlanNotify(runId: string) {
    await this.notifyQueue.add('pr-comment', { runId }, { jobId: `notify-${runId}` });
  }

  /** Drops a job that has not started yet. Running jobs check the run status themselves. */
  async remove(runId: string) {
    const job = await this.queue.getJob(runJobId(runId));
    if (job && !(await job.isActive())) await job.remove();
  }

  ping(): Promise<string> {
    return pingRedis(this.queue.client);
  }

  async onModuleDestroy() {
    await Promise.all([this.queue.close(), this.notifyQueue.close()]);
  }
}
