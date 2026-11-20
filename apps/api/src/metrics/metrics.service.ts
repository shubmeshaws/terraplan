import { Injectable } from '@nestjs/common';
import { PrismaService } from '../infra/prisma.service';
import { RedisService } from '../infra/redis.service';
import { LimitsService } from '../limits/limits.service';

/**
 * Prometheus text exposition for terraplan API.
 * Scraped at GET /api/v1/metrics (no auth — protect at the ingress).
 */
@Injectable()
export class MetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly limits: LimitsService,
  ) {}

  async renderPrometheus(): Promise<string> {
    const [
      runsByStatus,
      locksHeld,
      usersActive,
      failedLastHour,
      waitingApproval,
    ] = await Promise.all([
      this.prisma.run.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.environmentLock.count(),
      this.prisma.user.count({ where: { status: 'active' } }),
      this.prisma.run.count({
        where: {
          status: 'failed',
          finishedAt: { gte: new Date(Date.now() - 3_600_000) },
        },
      }),
      this.prisma.run.count({ where: { status: 'waiting_approval' } }),
    ]);

    const lines: string[] = [
      '# HELP terraplan_up 1 if the API process is up',
      '# TYPE terraplan_up gauge',
      'terraplan_up 1',
      '# HELP terraplan_runs_total Runs by status',
      '# TYPE terraplan_runs_total gauge',
    ];

    for (const row of runsByStatus) {
      lines.push(`terraplan_runs_total{status="${row.status}"} ${row._count._all}`);
    }

    lines.push(
      '# HELP terraplan_locks_held Environment locks currently held',
      '# TYPE terraplan_locks_held gauge',
      `terraplan_locks_held ${locksHeld}`,
      '# HELP terraplan_users_active Active users',
      '# TYPE terraplan_users_active gauge',
      `terraplan_users_active ${usersActive}`,
      '# HELP terraplan_runs_failed_last_hour Failed runs in the last hour (alert on spike)',
      '# TYPE terraplan_runs_failed_last_hour gauge',
      `terraplan_runs_failed_last_hour ${failedLastHour}`,
      '# HELP terraplan_runs_waiting_approval Runs waiting for approval',
      '# TYPE terraplan_runs_waiting_approval gauge',
      `terraplan_runs_waiting_approval ${waitingApproval}`,
      '# HELP terraplan_limit_runs_per_hour Configured per-user hourly rate limit',
      '# TYPE terraplan_limit_runs_per_hour gauge',
      `terraplan_limit_runs_per_hour ${this.limits.config.rateLimitRunsPerHour}`,
      '# HELP terraplan_limit_concurrent_runs Configured per-user concurrency cap',
      '# TYPE terraplan_limit_concurrent_runs gauge',
      `terraplan_limit_concurrent_runs ${this.limits.config.userMaxConcurrentRuns}`,
      '# HELP terraplan_run_timeout_seconds Configured run timeout',
      '# TYPE terraplan_run_timeout_seconds gauge',
      `terraplan_run_timeout_seconds ${this.limits.config.runTimeoutSeconds}`,
    );

    try {
      const pong = await this.redis.client.ping();
      lines.push(
        '# HELP terraplan_redis_up 1 if Redis responds to PING',
        '# TYPE terraplan_redis_up gauge',
        `terraplan_redis_up ${pong === 'PONG' ? 1 : 0}`,
      );
    } catch {
      lines.push('terraplan_redis_up 0');
    }

    return lines.join('\n') + '\n';
  }
}
