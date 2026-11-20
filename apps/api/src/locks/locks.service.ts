import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Environment, EnvironmentLockDto } from '@terraplan/shared';
import {
  decodeLockBusEvent,
  encodeLockBusEvent,
  envWaitKey,
  LOCKS_CHANNEL,
  LOCKS_SNAPSHOT_KEY,
} from '@terraplan/shared';
import { toLockDtos } from '@terraplan/shared/db';
import { PrismaService } from '../infra/prisma.service';
import { RedisService } from '../infra/redis.service';

type LockListener = (locks: EnvironmentLockDto[]) => void;

@Injectable()
export class LocksService implements OnModuleInit, OnModuleDestroy {
  private readonly listeners = new Set<LockListener>();
  private subscriber: ReturnType<RedisService['duplicateSubscriber']> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async onModuleInit() {
    this.subscriber = this.redis.duplicateSubscriber();
    await this.subscriber.subscribe(LOCKS_CHANNEL);
    this.subscriber.on('message', (_ch, raw) => {
      const event = decodeLockBusEvent(raw);
      if (!event) return;
      for (const listener of this.listeners) listener(event.locks);
    });
    // Seed snapshot so WS clients joining early get something.
    const locks = await this.list();
    await this.redis.client.set(
      LOCKS_SNAPSHOT_KEY,
      encodeLockBusEvent({ type: 'snapshot', locks }),
    );
  }

  async onModuleDestroy() {
    if (this.subscriber) {
      await this.subscriber.unsubscribe().catch(() => {});
      await this.subscriber.quit().catch(() => {});
    }
  }

  subscribe(listener: LockListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async list(): Promise<EnvironmentLockDto[]> {
    const locks = await this.prisma.environmentLock.findMany({ include: { run: true } });
    const waitingByEnv: Parameters<typeof toLockDtos>[1] = {};
    const named = await this.prisma.environmentConfig.findMany({ select: { name: true } });
    const allEnvs: Environment[] = [
      ...new Set([
        ...named.map((r) => r.name),
        ...locks.map((l) => l.environment),
      ]),
    ];
    await Promise.all(
      allEnvs.map(async (environment) => {
        const ids = await this.redis.client.zrange(envWaitKey(environment), 0, 49);
        if (!ids.length) {
          waitingByEnv[environment] = [];
          return;
        }
        const runs = await this.prisma.run.findMany({
          where: { id: { in: ids }, status: 'queued' },
          orderBy: { createdAt: 'asc' },
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
    return toLockDtos(locks, waitingByEnv);
  }

  /** When a run enters the BullMQ queue, mirror it into the Redis wait set + broadcast. */
  async markQueued(environment: Environment, runId: string) {
    await this.redis.client.zadd(envWaitKey(environment), Date.now(), runId);
    const locks = await this.list();
    const payload = encodeLockBusEvent({ type: 'waiting', environment, locks });
    await this.redis.client.set(LOCKS_SNAPSHOT_KEY, payload);
    await this.redis.client.publish(LOCKS_CHANNEL, payload);
  }

  async clearQueued(environment: Environment, runId: string) {
    await this.redis.client.zrem(envWaitKey(environment), runId);
    const locks = await this.list();
    const payload = encodeLockBusEvent({ type: 'released', environment, locks });
    await this.redis.client.set(LOCKS_SNAPSHOT_KEY, payload);
    await this.redis.client.publish(LOCKS_CHANNEL, payload);
  }
}
