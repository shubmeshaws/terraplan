import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import type { SessionUser } from '@terraplan/shared';
import { ENVIRONMENTS } from '@terraplan/shared';
import { toSessionUser } from '@terraplan/shared/db';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../infra/prisma.service';
import { env } from '../env';
import type { OAuthProfile } from './oauth.providers';

const userInclude = { roleAssignments: { include: { role: true } } } as const;

const ROLE_DEFS: { name: 'Viewer' | 'Planner' | 'Applier' | 'Admin'; description: string }[] = [
  { name: 'Viewer', description: 'Can view runs and plans in assigned environments.' },
  { name: 'Planner', description: 'Can run plans on lower environments (dev, qa, uat).' },
  {
    name: 'Applier',
    description: 'Can plan everywhere and apply on non-prod environments.',
  },
  {
    name: 'Admin',
    description: 'Full access: prod applies, destroys, approvals and user management.',
  },
];

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly log = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit() {
    await this.ensureRoles();
    this.log.log('Roles ready — first OAuth sign-in becomes Admin');
  }

  async getSessionUser(userId: string): Promise<SessionUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: userInclude });
    if (!user) throw new UnauthorizedException('Session user no longer exists');
    if (user.status === 'disabled') throw new ForbiddenException('Account is disabled');
    return toSessionUser(user);
  }

  async touchLastActive(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastActiveAt: new Date() },
    });
  }

  /** Ensure Viewer/Planner/Applier/Admin rows exist (safe after a fresh migrate). */
  private async ensureRoles() {
    for (const role of ROLE_DEFS) {
      await this.prisma.role.upsert({
        where: { name: role.name },
        create: role,
        update: { description: role.description },
      });
    }
  }

  /**
   * Links an OAuth profile to an invited/existing user, or creates one when
   * this is the first user, AUTH_ALLOW_AUTO_JOIN, or bootstrap admin rules allow it.
   * The first sign-in becomes Admin; later auto-join users become Viewer.
   */
  async upsertFromOAuth(profile: OAuthProfile, ip?: string | null): Promise<SessionUser> {
    const email = profile.email.trim().toLowerCase();

    const byProvider = await this.prisma.user.findFirst({
      where: { provider: profile.provider, providerId: profile.providerId },
      include: userInclude,
    });
    if (byProvider) {
      if (byProvider.status === 'disabled') {
        throw new ForbiddenException('Account is disabled');
      }
      const updated = await this.prisma.user.update({
        where: { id: byProvider.id },
        data: {
          name: profile.name,
          avatarUrl: profile.avatarUrl,
          email,
          status: 'active',
          lastActiveAt: new Date(),
        },
        include: userInclude,
      });
      await this.audit.write({
        actorId: updated.id,
        actorEmail: updated.email,
        action: 'auth.login',
        targetType: 'user',
        targetId: updated.id,
        metadata: { provider: profile.provider },
        ip,
      });
      return toSessionUser(updated);
    }

    const invited = await this.prisma.user.findUnique({
      where: { email },
      include: userInclude,
    });
    if (invited) {
      if (invited.status === 'disabled') {
        throw new ForbiddenException('Account is disabled');
      }
      const updated = await this.prisma.user.update({
        where: { id: invited.id },
        data: {
          provider: profile.provider,
          providerId: profile.providerId,
          name: profile.name || invited.name,
          avatarUrl: profile.avatarUrl,
          status: 'active',
          lastActiveAt: new Date(),
        },
        include: userInclude,
      });
      await this.audit.write({
        actorId: updated.id,
        actorEmail: updated.email,
        action: 'auth.login',
        targetType: 'user',
        targetId: updated.id,
        metadata: { provider: profile.provider, via: 'invite' },
        ip,
      });
      return toSessionUser(updated);
    }

    await this.ensureRoles();

    const bootstrap = env.AUTH_BOOTSTRAP_ADMIN_EMAIL?.toLowerCase();
    const isBootstrap = !!bootstrap && bootstrap === email;
    // First OAuth sign-in → Admin. Everyone after → Viewer (normal user).
    const signedInCount = await this.prisma.user.count({ where: { provider: { not: null } } });
    const isFirstUser = signedInCount === 0;
    const allowAutoJoin = env.AUTH_ALLOW_AUTO_JOIN !== false;
    if (!isBootstrap && !isFirstUser && !allowAutoJoin) {
      throw new ForbiddenException(
        'No terraplan account for this email. Ask an admin to invite you.',
      );
    }

    const roleName = isBootstrap || isFirstUser ? 'Admin' : 'Viewer';
    const role = await this.prisma.role.findUnique({ where: { name: roleName } });
    if (!role) throw new NotFoundException(`${roleName} role is not seeded`);

    const created = await this.prisma.user.create({
      data: {
        email,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
        provider: profile.provider,
        providerId: profile.providerId,
        status: 'active',
        lastActiveAt: new Date(),
        roleAssignments: {
          create: ENVIRONMENTS.map((environment) => ({
            environment,
            roleId: role.id,
          })),
        },
      },
      include: userInclude,
    });
    await this.audit.write({
      actorId: created.id,
      actorEmail: created.email,
      action: 'auth.signup',
      targetType: 'user',
      targetId: created.id,
      metadata: {
        provider: profile.provider,
        role: roleName,
        via: isFirstUser ? 'first-user' : 'auto-join',
      },
      ip,
    });
    return toSessionUser(created);
  }

  providers(): { google: boolean } {
    return {
      google: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    };
  }
}
