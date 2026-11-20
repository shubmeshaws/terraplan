import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AssumeRoleResultDto,
  Environment,
  EnvironmentConfigDto,
  SessionUser,
  UpsertEnvironmentInput,
} from '@terraplan/shared';
import { assumeRole, ENVIRONMENTS } from '@terraplan/shared';
import type { EnvironmentConfig, Prisma } from '@terraplan/shared/db';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../infra/prisma.service';

@Injectable()
export class EnvironmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<EnvironmentConfigDto[]> {
    const rows = await this.prisma.environmentConfig.findMany({
      orderBy: { name: 'asc' },
    });
    return rows.map(toDto);
  }

  async get(name: Environment): Promise<EnvironmentConfigDto> {
    const row = await this.prisma.environmentConfig.findUnique({ where: { name } });
    if (!row) throw new NotFoundException(`Environment ${name} is not configured`);
    return toDto(row);
  }

  async upsert(
    actor: SessionUser,
    input: UpsertEnvironmentInput,
    ip?: string | null,
  ): Promise<EnvironmentConfigDto> {
    const data = {
      displayName: input.displayName ?? null,
      repository: input.repository,
      terraformDir: input.terraformDir,
      backendConfig: input.backendConfig as Prisma.InputJsonValue,
      awsAccountId: input.awsAccountId,
      roleArn: input.roleArn,
      externalId: input.externalId ?? null,
      sessionDurationSeconds: input.sessionDurationSeconds,
      terraformVersion: input.terraformVersion,
      variableFiles: input.variableFiles as Prisma.InputJsonValue,
      approvalPolicy: input.approvalPolicy as Prisma.InputJsonValue,
      enabled: input.enabled,
    };
    const row = await this.prisma.environmentConfig.upsert({
      where: { name: input.name },
      create: { name: input.name, ...data },
      update: data,
    });
    await this.audit.write({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'environment.upsert',
      targetType: 'environment',
      targetId: row.id,
      environment: row.name,
      metadata: {
        repository: row.repository,
        roleArn: row.roleArn,
        awsAccountId: row.awsAccountId,
      },
      ip,
    });
    return toDto(row);
  }

  async remove(actor: SessionUser, name: Environment, ip?: string | null) {
    const existing = await this.prisma.environmentConfig.findUnique({ where: { name } });
    if (!existing) throw new NotFoundException(`Environment ${name} is not configured`);
    await this.prisma.environmentConfig.delete({ where: { name } });
    await this.audit.write({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'environment.delete',
      targetType: 'environment',
      targetId: existing.id,
      environment: name,
      ip,
    });
    return { ok: true };
  }

  /** Probe STS AssumeRole using the API host credential chain (no stored keys). */
  async testAssume(
    actor: SessionUser,
    name: Environment,
    ip?: string | null,
  ): Promise<AssumeRoleResultDto> {
    const row = await this.prisma.environmentConfig.findUnique({ where: { name } });
    if (!row) throw new NotFoundException(`Environment ${name} is not configured`);
    if (!row.enabled) throw new BadRequestException(`Environment ${name} is disabled`);

    try {
      const creds = await assumeRole({
        roleArn: row.roleArn,
        sessionName: `terraplan-test-${name}-${actor.id.slice(-6)}`,
        durationSeconds: Math.min(900, row.sessionDurationSeconds),
        externalId: row.externalId,
        region: (row.backendConfig as { region?: string } | null)?.region,
      });
      await this.prisma.environmentConfig.update({
        where: { id: row.id },
        data: { lastAssumedAt: new Date(), lastAssumeError: null },
      });
      await this.audit.write({
        actorId: actor.id,
        actorEmail: actor.email,
        action: 'environment.assume_test',
        targetType: 'environment',
        targetId: row.id,
        environment: name,
        metadata: { expiration: creds.expiration.toISOString() },
        ip,
      });
      return {
        ok: true,
        accessKeyIdPreview: `${creds.accessKeyId.slice(0, 4)}…${creds.accessKeyId.slice(-4)}`,
        expiration: creds.expiration.toISOString(),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.environmentConfig.update({
        where: { id: row.id },
        data: { lastAssumeError: message },
      });
      await this.audit.write({
        actorId: actor.id,
        actorEmail: actor.email,
        action: 'environment.assume_test',
        targetType: 'environment',
        targetId: row.id,
        environment: name,
        metadata: { error: message },
        result: 'failure',
        ip,
      });
      return { ok: false, error: message };
    }
  }

  /** Names still missing a config row (for admin UI empty-state). */
  async missingNames(): Promise<Environment[]> {
    const existing = await this.prisma.environmentConfig.findMany({ select: { name: true } });
    const have = new Set(existing.map((e) => e.name));
    return ENVIRONMENTS.filter((n) => !have.has(n));
  }
}

function toDto(row: EnvironmentConfig): EnvironmentConfigDto {
  return {
    id: row.id,
    name: row.name,
    displayName: row.displayName,
    repository: row.repository,
    terraformDir: row.terraformDir,
    backendConfig: row.backendConfig as EnvironmentConfigDto['backendConfig'],
    awsAccountId: row.awsAccountId,
    roleArn: row.roleArn,
    externalId: row.externalId,
    sessionDurationSeconds: row.sessionDurationSeconds,
    terraformVersion: row.terraformVersion,
    variableFiles: Array.isArray(row.variableFiles)
      ? (row.variableFiles as string[])
      : [],
    approvalPolicy: row.approvalPolicy as EnvironmentConfigDto['approvalPolicy'],
    enabled: row.enabled,
    lastAssumedAt: row.lastAssumedAt?.toISOString() ?? null,
    lastAssumeError: row.lastAssumeError,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
