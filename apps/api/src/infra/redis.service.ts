import type { OnModuleDestroy } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { env } from '../env';

@Injectable()
export class RedisService implements OnModuleDestroy {
  /** General-purpose client (get buffer, etc.). */
  readonly client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

  /** Dedicated subscriber — ioredis clients in subscribe mode cannot run other commands. */
  duplicateSubscriber(): Redis {
    return this.client.duplicate();
  }

  async onModuleDestroy() {
    await this.client.quit().catch(() => {});
  }
}
