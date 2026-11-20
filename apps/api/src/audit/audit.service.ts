import { Injectable } from '@nestjs/common';
import type { Environment, ExportAuditLogsQuery, ListAuditLogsQuery } from '@terraplan/shared';
import type { Prisma } from '@terraplan/shared/db';
import { toAuditLogDto } from '@terraplan/shared/db';
import { PrismaService } from '../infra/prisma.service';

export interface AuditWriteInput {
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  environment?: Environment | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  result?: 'success' | 'failure';
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async write(input: AuditWriteInput) {
    return this.prisma.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        actorEmail: input.actorEmail ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        environment: input.environment ?? null,
        metadata: (input.metadata as Prisma.InputJsonValue | undefined) ?? undefined,
        ip: input.ip ?? null,
        result: input.result ?? 'success',
      },
    });
  }

  async list(query: ListAuditLogsQuery) {
    const rows = await this.prisma.auditLog.findMany({
      where: query.action ? { action: query.action } : undefined,
      orderBy: { createdAt: 'desc' },
      take: query.limit,
    });
    return rows.map(toAuditLogDto);
  }

  async export(query: ExportAuditLogsQuery) {
    const where: Prisma.AuditLogWhereInput = {};
    if (query.action) where.action = query.action;
    if (query.since || query.until) {
      where.createdAt = {};
      if (query.since) where.createdAt.gte = new Date(query.since);
      if (query.until) where.createdAt.lte = new Date(query.until);
    }
    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query.limit,
    });
    const dtos = rows.map(toAuditLogDto);
    if (query.format === 'json') {
      return { format: 'json' as const, body: JSON.stringify(dtos, null, 2), count: dtos.length };
    }
    const header = [
      'createdAt',
      'actorEmail',
      'action',
      'targetType',
      'targetId',
      'environment',
      'ip',
      'result',
    ];
    const escape = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      header.join(','),
      ...dtos.map((r) =>
        [
          r.createdAt,
          r.actorEmail,
          r.action,
          r.targetType,
          r.targetId,
          r.environment,
          r.ip,
          r.result,
        ]
          .map(escape)
          .join(','),
      ),
    ];
    return { format: 'csv' as const, body: lines.join('\n') + '\n', count: dtos.length };
  }
}
