import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { HealthCheck, HealthReport } from '@terraplan/shared';
import type { Response } from 'express';
import { PrismaService } from '../infra/prisma.service';
import { RunQueueService } from '../infra/run-queue.service';

const TIMEOUT_MS = 2_000;

async function check(fn: () => Promise<unknown>): Promise<HealthCheck> {
  const t0 = Date.now();
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timed out')), TIMEOUT_MS)),
    ]);
    return { status: 'ok', latencyMs: Date.now() - t0 };
  } catch (err) {
    return { status: 'error', latencyMs: Date.now() - t0, error: (err as Error).message };
  }
}

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: RunQueueService,
  ) {}

  /** Liveness: the process is up. Never touches dependencies. */
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  /** Readiness: Postgres and Redis are reachable. Returns 503 otherwise. */
  @Get()
  async health(@Res({ passthrough: true }) res: Response): Promise<HealthReport> {
    const [database, redis] = await Promise.all([
      check(() => this.prisma.$queryRaw`SELECT 1`),
      check(() => this.queue.ping()),
    ]);
    const ok = database.status === 'ok' && redis.status === 'ok';
    res.status(ok ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return {
      status: ok ? 'ok' : 'degraded',
      service: 'api',
      version: process.env.npm_package_version ?? '0.1.0',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      checks: { database, redis },
    };
  }
}
