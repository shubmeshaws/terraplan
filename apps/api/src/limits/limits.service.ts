import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  currentHourBucket,
  limitKeys,
  platformLimitsFromEnv,
} from '@terraplan/shared';
import { env } from '../env';
import { PrismaService } from '../infra/prisma.service';
import { RedisService } from '../infra/redis.service';

@Injectable()
export class LimitsService {
  private readonly logger = new Logger(LimitsService.name);
  private readonly limits = platformLimitsFromEnv(env);

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  get config() {
    return this.limits;
  }

  /**
   * Enforce per-user hourly rate limit and concurrent active-run cap.
   * Throws 429 on rate limit, 409 on concurrency cap.
   */
  async assertCanCreateRun(userId: string, triggeredByName: string): Promise<void> {
    await this.assertRateLimit(userId);
    await this.assertConcurrency(userId, triggeredByName);
  }

  private async assertRateLimit(userId: string) {
    const key = limitKeys.rateHour(userId, currentHourBucket());
    const count = await this.redis.client.incr(key);
    if (count === 1) {
      await this.redis.client.expire(key, 3600 + 60);
    }
    if (count > this.limits.rateLimitRunsPerHour) {
      this.logger.warn(`rate limit exceeded for user ${userId}`, {
        count,
        limit: this.limits.rateLimitRunsPerHour,
      });
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Rate limit exceeded: max ${this.limits.rateLimitRunsPerHour} runs per hour`,
          limit: this.limits.rateLimitRunsPerHour,
          retryAfterSeconds: 3600,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async assertConcurrency(userId: string, triggeredByName: string) {
    const active = await this.prisma.run.count({
      where: {
        triggeredBy: triggeredByName,
        status: { in: ['waiting_approval', 'queued', 'running'] },
      },
    });
    if (active >= this.limits.userMaxConcurrentRuns) {
      throw new HttpException(
        {
          statusCode: HttpStatus.CONFLICT,
          message: `Concurrency cap: max ${this.limits.userMaxConcurrentRuns} active runs per user`,
          limit: this.limits.userMaxConcurrentRuns,
          active,
        },
        HttpStatus.CONFLICT,
      );
    }
    // Mirror into Redis for dashboards / metrics (best-effort).
    await this.redis.client
      .set(limitKeys.concurrent(userId), String(active + 1), 'EX', 86_400)
      .catch(() => {});
  }
}
