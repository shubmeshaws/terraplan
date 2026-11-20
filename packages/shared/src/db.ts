import { PrismaClient } from '@prisma/client';
import type { AuditLog, EnvironmentLock, Role, RoleAssignment, Run, User } from '@prisma/client';
import type { EnvironmentLockDto, RunDto, WaitingRunDto } from './domain';
import type { AuditLogDto, RoleName, SessionUser, UserDto } from './rbac';
import { highestRole, permissionMap } from './rbac';

export { Prisma, PrismaClient } from '@prisma/client';
export type {
  AuditLog,
  EnvironmentConfig,
  EnvironmentLock,
  Role,
  RoleAssignment,
  Run,
  User,
} from '@prisma/client';

export function createPrismaClient() {
  return new PrismaClient({
    log: process.env.LOG_LEVEL === 'debug' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function toRunDto(run: Run): RunDto {
  return {
    id: run.id,
    repository: run.repository,
    branch: run.branch,
    environment: run.environment,
    action: run.action,
    status: run.status,
    triggeredBy: run.triggeredBy,
    commitSha: run.commitSha,
    approvedBy: run.approvedBy,
    planSummary: run.planSummary,
    output: run.output,
    error: run.error,
    planFileKey: run.planFileKey,
    planJsonKey: run.planJsonKey,
    logFileKey: run.logFileKey,
    terraformVersion: run.terraformVersion,
    sourcePlanRunId: run.sourcePlanRunId,
    pullRequestId: run.pullRequestId,
    pullRequestUrl: run.pullRequestUrl,
    prCommentId: run.prCommentId,
    createdAt: run.createdAt.toISOString(),
    startedAt: iso(run.startedAt),
    finishedAt: iso(run.finishedAt),
  };
}

/** Returns one entry per environment, free or held, in display order. */
export function toLockDtos(
  locks: (EnvironmentLock & { run: Run | null })[],
  waitingByEnv: Partial<Record<string, WaitingRunDto[]>> = {},
): EnvironmentLockDto[] {
  const names = [
    ...new Set([
      ...locks.map((l) => l.environment),
      ...Object.keys(waitingByEnv),
    ]),
  ].sort();
  return names.map((environment) => {
    const lock = locks.find((l) => l.environment === environment);
    return {
      environment,
      held: !!lock,
      runId: lock?.runId ?? null,
      action: lock?.run?.action ?? null,
      branch: lock?.run?.branch ?? null,
      repository: lock?.run?.repository ?? null,
      status: lock?.run?.status ?? null,
      holder: lock?.run?.triggeredBy ?? null,
      acquiredAt: iso(lock?.acquiredAt ?? null),
      startedAt: iso(lock?.run?.startedAt ?? null),
      waiting: waitingByEnv[environment] ?? [],
    };
  });
}

type UserWithAssignments = User & {
  roleAssignments: (RoleAssignment & { role: Role })[];
};

export function toUserDto(user: UserWithAssignments): UserDto {
  const assignments = user.roleAssignments.map((a) => ({
    environment: a.environment,
    role: a.role.name as RoleName,
  }));
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    provider: user.provider,
    status: user.status,
    assignments,
    highestRole: highestRole(assignments.map((a) => a.role)),
    invitedById: user.invitedById,
    lastActiveAt: iso(user.lastActiveAt),
    createdAt: user.createdAt.toISOString(),
  };
}

export function toSessionUser(user: UserWithAssignments): SessionUser {
  const dto = toUserDto(user);
  return {
    id: dto.id,
    email: dto.email,
    name: dto.name,
    avatarUrl: dto.avatarUrl,
    provider: dto.provider,
    status: dto.status,
    assignments: dto.assignments,
    highestRole: dto.highestRole,
    permissions: permissionMap(dto.assignments),
  };
}

export function toAuditLogDto(row: AuditLog): AuditLogDto {
  return {
    id: row.id,
    actorId: row.actorId,
    actorEmail: row.actorEmail,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    environment: row.environment,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    ip: row.ip,
    result: row.result,
    createdAt: row.createdAt.toISOString(),
  };
}
