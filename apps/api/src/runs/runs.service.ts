import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  ApprovalPolicy,
  CreateRunInput,
  ListRunsQuery,
  RunDto,
  SessionUser,
} from '@terraplan/shared';
import {
  permissionForAction,
  requiresApproval,
  roleCanApprove,
} from '@terraplan/shared';
import { toRunDto } from '@terraplan/shared/db';
import { AuditService } from '../audit/audit.service';
import { assertPermission } from '../auth/rbac.guard';
import { LimitsService } from '../limits/limits.service';
import { LocksService } from '../locks/locks.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../infra/prisma.service';
import { RunQueueService } from '../infra/run-queue.service';

@Injectable()
export class RunsService {
  private readonly logger = new Logger(RunsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: RunQueueService,
    private readonly audit: AuditService,
    private readonly locks: LocksService,
    private readonly limits: LimitsService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(query: ListRunsQuery): Promise<RunDto[]> {
    const runs = await this.prisma.run.findMany({
      where: { environment: query.environment, action: query.action, status: query.status },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
    });
    return runs.map(toRunDto);
  }

  async get(id: string): Promise<RunDto> {
    const run = await this.prisma.run.findUnique({ where: { id } });
    if (!run) throw new NotFoundException(`Run ${id} not found`);
    return toRunDto(run);
  }

  async create(user: SessionUser, input: CreateRunInput): Promise<RunDto> {
    assertPermission(user, input.environment, permissionForAction(input.action));
    await this.limits.assertCanCreateRun(user.id, user.name);

    const envConfig = await this.prisma.environmentConfig.findUnique({
      where: { name: input.environment },
    });
    const policy = (envConfig?.approvalPolicy as ApprovalPolicy | null) ?? null;
    const needsApproval = requiresApproval(input.action, input.environment, policy);

    let sourcePlanRunId: string | null = null;
    let planFileKey: string | null = null;
    let planJsonKey: string | null = null;
    let planSummary: string | null = null;
    let commitSha: string | null = null;
    let terraformVersion: string | null = null;

    if (input.action === 'apply') {
      const plan = await this.prisma.run.findUnique({ where: { id: input.sourcePlanRunId! } });
      if (!plan) throw new BadRequestException('sourcePlanRunId does not exist');
      if (plan.action !== 'plan') {
        throw new BadRequestException('sourcePlanRunId must reference a plan run');
      }
      if (plan.status !== 'succeeded') {
        throw new BadRequestException('source plan must have succeeded before apply');
      }
      if (plan.environment !== input.environment) {
        throw new BadRequestException('source plan environment must match apply environment');
      }
      if (plan.repository !== input.repository) {
        throw new BadRequestException('source plan repository must match apply repository');
      }
      if (!plan.planFileKey) {
        throw new BadRequestException(
          'source plan has no saved plan file; re-run the plan before applying',
        );
      }
      sourcePlanRunId = plan.id;
      planFileKey = plan.planFileKey;
      planJsonKey = plan.planJsonKey;
      planSummary = plan.planSummary;
      commitSha = plan.commitSha;
      terraformVersion = plan.terraformVersion;
      // Apply the plan at the exact commit the plan was produced for.
      if (plan.branch !== input.branch) {
        throw new BadRequestException(
          `branch must match the source plan branch (${plan.branch})`,
        );
      }
    }

    const { destroyConfirmation: _omit, sourcePlanRunId: _sid, ...rest } = input;
    const run = await this.prisma.run.create({
      data: {
        ...rest,
        triggeredBy: user.name,
        status: needsApproval ? 'waiting_approval' : 'queued',
        sourcePlanRunId,
        planFileKey,
        planJsonKey,
        planSummary,
        commitSha,
        terraformVersion,
      },
    });

    if (!needsApproval) {
      await this.enqueueOrFail(run.id);
      await this.locks.markQueued(run.environment, run.id);
    }

    await this.audit.write({
      actorId: user.id,
      actorEmail: user.email,
      action: `runs.create.${input.action}`,
      targetType: 'run',
      targetId: run.id,
      environment: input.environment,
      metadata: {
        repository: input.repository,
        branch: input.branch,
        sourcePlanRunId,
        needsApproval,
      },
    });
    const dto = await this.get(run.id);
    void this.notifications.notifyRunEvent(
      dto,
      needsApproval ? 'waiting_approval' : 'queued',
    );
    return dto;
  }

  async approve(user: SessionUser, id: string): Promise<RunDto> {
    const run = await this.prisma.run.findUnique({ where: { id } });
    if (!run) throw new NotFoundException(`Run ${id} not found`);
    assertPermission(user, run.environment, 'runs:approve');

    const envConfig = await this.prisma.environmentConfig.findUnique({
      where: { name: run.environment },
    });
    const policy = (envConfig?.approvalPolicy as ApprovalPolicy | null) ?? null;
    const actor = policy ? policy[run.action] : 'admin';
    const userRole =
      user.assignments.find((a) => a.environment === run.environment)?.role ?? user.highestRole;
    if (!roleCanApprove(userRole, actor)) {
      throw new ForbiddenException(
        `Approval for ${run.action} on ${run.environment} requires ${actor} (or Admin)`,
      );
    }

    const { count } = await this.prisma.run.updateMany({
      where: { id, status: 'waiting_approval' },
      data: { status: 'queued', approvedBy: user.name },
    });
    if (count === 0) {
      throw new ConflictException(`Run ${id} is not waiting for approval`);
    }
    await this.enqueueOrFail(id);
    await this.locks.markQueued(run.environment, id);
    await this.audit.write({
      actorId: user.id,
      actorEmail: user.email,
      action: 'runs.approve',
      targetType: 'run',
      targetId: id,
      environment: run.environment,
    });
    const dto = await this.get(id);
    void this.notifications.notifyRunEvent(dto, 'queued');
    return dto;
  }

  async cancel(user: SessionUser, id: string): Promise<RunDto> {
    const run = await this.prisma.run.findUnique({ where: { id } });
    if (!run) throw new NotFoundException(`Run ${id} not found`);
    const isOwner = run.triggeredBy === user.name;
    if (!isOwner) {
      try {
        assertPermission(user, run.environment, 'runs:approve');
      } catch {
        throw new ForbiddenException('Only the author or an approver can cancel this run');
      }
    }

    const { count } = await this.prisma.run.updateMany({
      where: { id, status: { in: ['waiting_approval', 'queued'] } },
      data: { status: 'cancelled', finishedAt: new Date() },
    });
    if (count === 0) {
      throw new ConflictException(`Run ${id} can only be cancelled before it starts`);
    }
    await this.queue.remove(id).catch((err) => this.logger.warn(`Could not drop job: ${err}`));
    await this.locks.clearQueued(run.environment, id);
    await this.audit.write({
      actorId: user.id,
      actorEmail: user.email,
      action: 'runs.cancel',
      targetType: 'run',
      targetId: id,
      environment: run.environment,
    });
    const dto = await this.get(id);
    void this.notifications.notifyRunEvent(dto, 'cancelled');
    return dto;
  }

  private async enqueueOrFail(id: string) {
    try {
      await this.queue.enqueue(id);
    } catch (err) {
      this.logger.error(`Failed to enqueue run ${id}: ${err}`);
      await this.prisma.run.update({
        where: { id },
        data: { status: 'failed', error: 'Could not reach the job queue', finishedAt: new Date() },
      });
    }
  }
}
