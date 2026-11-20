import type Redis from 'ioredis';
import {
  encodeRunLogEvent,
  RUN_LOG_BUFFER_MAX,
  RUN_LOG_BUFFER_TTL_SEC,
  runLogBufferKey,
  runLogChannel,
  type RunLogEvent,
} from '@terraplan/shared';

/** Publishes live log events and keeps a short Redis buffer for late SSE subscribers. */
export class RunLogPublisher {
  constructor(private readonly redis: Redis) {}

  async publish(runId: string, event: RunLogEvent): Promise<void> {
    const payload = encodeRunLogEvent(event);
    const channel = runLogChannel(runId);
    const buf = runLogBufferKey(runId);
    const pipe = this.redis.pipeline();
    pipe.publish(channel, payload);
    if (event.type === 'chunk') {
      pipe.rpush(buf, payload);
      pipe.ltrim(buf, -RUN_LOG_BUFFER_MAX, -1);
      pipe.expire(buf, RUN_LOG_BUFFER_TTL_SEC);
    } else {
      pipe.rpush(buf, payload);
      pipe.expire(buf, RUN_LOG_BUFFER_TTL_SEC);
    }
    await pipe.exec();
  }
}
