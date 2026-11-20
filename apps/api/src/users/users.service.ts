import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  InviteUserInput,
  ListUsersQuery,
  RoleAssignmentDto,
  SessionUser,
  UpdateUserRolesInput,
  UpdateUserStatusInput,
  UserDto,
} from '@terraplan/shared';
import { toUserDto } from '@terraplan/shared/db';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../infra/prisma.service';

const userInclude = { roleAssignments: { include: { role: true } } } as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListUsersQuery): Promise<UserDto[]> {
    const users = await this.prisma.user.findMany({
      where: {
        status: query.status,
        OR: query.q
          ? [
              { email: { contains: query.q, mode: 'insensitive' } },
              { name: { contains: query.q, mode: 'insensitive' } },
            ]
          : undefined,
      },
      include: userInclude,
      orderBy: { createdAt: 'desc' },
    });
    return users.map(toUserDto);
  }

  async get(id: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({ where: { id }, include: userInclude });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return toUserDto(user);
  }

  async invite(actor: SessionUser, input: InviteUserInput, ip?: string | null): Promise<UserDto> {
    this.assertUniqueEnvironments(input.assignments);
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new ConflictException(`User ${input.email} already exists`);
    }

    const roleIds = await this.roleIdMap();
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        name: input.name || input.email.split('@')[0]!,
        status: 'invited',
        invitedById: actor.id,
        roleAssignments: {
          create: input.assignments.map((a) => ({
            environment: a.environment,
            roleId: roleIds[a.role],
            assignedById: actor.id,
          })),
        },
      },
      include: userInclude,
    });

    await this.audit.write({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'users.invite',
      targetType: 'user',
      targetId: user.id,
      metadata: { email: user.email, assignments: input.assignments },
      ip,
    });
    return toUserDto(user);
  }

  async updateRoles(
    actor: SessionUser,
    userId: string,
    input: UpdateUserRolesInput,
    ip?: string | null,
  ): Promise<UserDto> {
    this.assertUniqueEnvironments(input.assignments);
    const existing = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!existing) throw new NotFoundException(`User ${userId} not found`);

    const roleIds = await this.roleIdMap();
    await this.prisma.$transaction(async (tx) => {
      await tx.roleAssignment.deleteMany({ where: { userId } });
      await tx.roleAssignment.createMany({
        data: input.assignments.map((a) => ({
          userId,
          environment: a.environment,
          roleId: roleIds[a.role],
          assignedById: actor.id,
        })),
      });
    });

    await this.audit.write({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'users.change_roles',
      targetType: 'user',
      targetId: userId,
      metadata: { email: existing.email, assignments: input.assignments },
      ip,
    });
    return this.get(userId);
  }

  async updateStatus(
    actor: SessionUser,
    userId: string,
    input: UpdateUserStatusInput,
    ip?: string | null,
  ): Promise<UserDto> {
    if (actor.id === userId && input.status === 'disabled') {
      throw new BadRequestException('You cannot disable your own account');
    }
    const existing = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!existing) throw new NotFoundException(`User ${userId} not found`);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { status: input.status },
      include: userInclude,
    });

    await this.audit.write({
      actorId: actor.id,
      actorEmail: actor.email,
      action: input.status === 'disabled' ? 'users.disable' : 'users.enable',
      targetType: 'user',
      targetId: userId,
      metadata: { email: existing.email, from: existing.status, to: input.status },
      ip,
    });
    return toUserDto(user);
  }

  async roles() {
    return this.prisma.role.findMany({ orderBy: { name: 'asc' } });
  }

  private assertUniqueEnvironments(assignments: RoleAssignmentDto[]) {
    const seen = new Set<string>();
    for (const a of assignments) {
      if (seen.has(a.environment)) {
        throw new BadRequestException(`Duplicate assignment for environment ${a.environment}`);
      }
      seen.add(a.environment);
    }
  }

  private async roleIdMap(): Promise<Record<string, string>> {
    const roles = await this.prisma.role.findMany();
    return Object.fromEntries(roles.map((r) => [r.name, r.id]));
  }
}
