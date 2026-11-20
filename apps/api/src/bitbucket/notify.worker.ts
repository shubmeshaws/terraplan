import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import type { BitbucketNotifyJobData } from '@terraplan/shared';
import { BITBUCKET_NOTIFY_QUEUE, redisConnectionFromUrl } from '@terraplan/shared';
import { Worker } from 'bullmq';
import { env } from '../env';
import { BitbucketService } from './bitbucket.service';

/** Processes PR-comment jobs enqueued when a plan finishes. */
@Injectable()
export class BitbucketNotifyWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BitbucketNotifyWorker.name);
  private worker: Worker<BitbucketNotifyJobData> | null = null;

  constructor(private readonly bitbucket: BitbucketService) {}

  onModuleInit() {
    this.worker = new Worker<BitbucketNotifyJobData>(
      BITBUCKET_NOTIFY_QUEUE,
      async (job) => {
        const result = await this.bitbucket.postPlanComment(job.data.runId);
        this.logger.debug(`notify ${job.data.runId}: ${JSON.stringify(result)}`);
      },
      {
        connection: redisConnectionFromUrl(env.REDIS_URL),
        concurrency: 2,
      },
    );
    this.worker.on('failed', (job, err) =>
      this.logger.warn(`notify job failed ${job?.id}: ${err.message}`),
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }
}
