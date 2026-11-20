import { Injectable, NotFoundException } from '@nestjs/common';
import {
  decodeRunLogEvent,
  runLogBufferKey,
  runLogChannel,
  TERMINAL_STATUSES,
  type RunStatus,
} from '@terraplan/shared';
import { Observable } from 'rxjs';
import { PrismaService } from '../infra/prisma.service';
import { RedisService } from '../infra/redis.service';

export interface LogStreamMessage {
  data: string;
  type?: string;
  id?: string;
}

@Injectable()
export class RunLogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * SSE stream: replays DB output + Redis buffer, then live pub/sub chunks
   * until the run reaches a terminal status.
   */
  stream(runId: string): Observable<LogStreamMessage> {
    return new Observable((subscriber) => {
      let closed = false;
      let sub: ReturnType<RedisService['duplicateSubscriber']> | null = null;
      let poll: ReturnType<typeof setInterval> | null = null;

      const safeNext = (msg: LogStreamMessage) => {
        if (!closed) subscriber.next(msg);
      };
      const safeComplete = () => {
        if (!closed) {
          closed = true;
          subscriber.complete();
        }
      };

      void (async () => {
        const run = await this.prisma.run.findUnique({ where: { id: runId } });
        if (!run) {
          subscriber.error(new NotFoundException(`Run ${runId} not found`));
          return;
        }

        // Snapshot already persisted in Postgres.
        if (run.output) {
          safeNext({ type: 'snapshot', data: run.output });
        }

        // Recent Redis buffer (may overlap snapshot — client can append).
        const buffered = await this.redis.client.lrange(runLogBufferKey(runId), 0, -1);
        for (const raw of buffered) {
          const event = decodeRunLogEvent(raw);
          if (!event) continue;
          if (event.type === 'chunk') {
            safeNext({ type: 'chunk', data: event.text });
          } else {
            safeNext({ type: 'done', data: event.status });
            safeComplete();
            return;
          }
        }

        if (TERMINAL_STATUSES.includes(run.status as RunStatus)) {
          safeNext({ type: 'done', data: run.status });
          safeComplete();
          return;
        }

        sub = this.redis.duplicateSubscriber();
        const channel = runLogChannel(runId);
        await sub.subscribe(channel);
        sub.on('message', (_ch, raw) => {
          const event = decodeRunLogEvent(raw);
          if (!event) return;
          if (event.type === 'chunk') {
            safeNext({ type: 'chunk', data: event.text });
          } else {
            safeNext({ type: 'done', data: event.status });
            safeComplete();
          }
        });

        // Safety net: poll DB status in case we missed the done event.
        poll = setInterval(() => {
          void this.prisma.run
            .findUnique({ where: { id: runId }, select: { status: true, output: true } })
            .then((row) => {
              if (!row || closed) return;
              if (TERMINAL_STATUSES.includes(row.status as RunStatus)) {
                safeNext({ type: 'done', data: row.status });
                safeComplete();
              }
            })
            .catch(() => {});
        }, 5_000);
      })().catch((err) => {
        if (!closed) subscriber.error(err);
      });

      return () => {
        closed = true;
        if (poll) clearInterval(poll);
        if (sub) {
          void sub.unsubscribe().finally(() => sub?.quit().catch(() => {}));
        }
      };
    });
  }
}
