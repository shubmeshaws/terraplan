import { Module } from '@nestjs/common';
import { AuditService } from './audit/audit.service';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { AuthService } from './auth/auth.service';
import { RbacGuard } from './auth/rbac.guard';
import { BitbucketController } from './bitbucket/bitbucket.controller';
import { BitbucketService } from './bitbucket/bitbucket.service';
import { BitbucketNotifyWorker } from './bitbucket/notify.worker';
import { BitbucketWebhookController } from './bitbucket/webhook.controller';
import { HealthController } from './health/health.controller';
import { PrismaService } from './infra/prisma.service';
import { RedisService } from './infra/redis.service';
import { RunQueueService } from './infra/run-queue.service';
import { LimitsService } from './limits/limits.service';
import { LocksController } from './locks/locks.controller';
import { LocksGateway } from './locks/locks.gateway';
import { LocksService } from './locks/locks.service';
import { MetricsController } from './metrics/metrics.controller';
import { MetricsService } from './metrics/metrics.service';
import { NotificationsService } from './notifications/notifications.service';
import { RunLogsService } from './runs/run-logs.service';
import { RunsController } from './runs/runs.controller';
import { RunsService } from './runs/runs.service';
import { EnvironmentsController } from './environments/environments.controller';
import { EnvironmentsService } from './environments/environments.service';
import { UsersController } from './users/users.controller';
import { UsersService } from './users/users.service';

@Module({
  controllers: [
    HealthController,
    MetricsController,
    AuthController,
    RunsController,
    LocksController,
    UsersController,
    BitbucketController,
    BitbucketWebhookController,
    EnvironmentsController,
  ],
  providers: [
    PrismaService,
    RedisService,
    RunQueueService,
    AuditService,
    AuthService,
    AuthGuard,
    RbacGuard,
    LimitsService,
    NotificationsService,
    MetricsService,
    LocksService,
    LocksGateway,
    RunsService,
    RunLogsService,
    UsersService,
    BitbucketService,
    BitbucketNotifyWorker,
    EnvironmentsService,
  ],
})
export class AppModule {}
