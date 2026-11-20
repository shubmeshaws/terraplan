import {
  applyDecorators,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Environment, Permission, SessionUser } from '@terraplan/shared';
import { ENVIRONMENTS, isAdmin, userHasPermission } from '@terraplan/shared';
import type { AuthedRequest } from './auth.guard';

export const PERMISSION_KEY = 'terraplan.permission';
export const ENV_PARAM_KEY = 'terraplan.envParam';
export const ADMIN_KEY = 'terraplan.admin';

/** Require a permission. If `envParam` is set, check that path/body/query field. */
export const RequirePermission = (permission: Permission, envParam?: string) =>
  applyDecorators(
    SetMetadata(PERMISSION_KEY, permission),
    ...(envParam ? [SetMetadata(ENV_PARAM_KEY, envParam)] : []),
  );

export const RequireAdmin = () => SetMetadata(ADMIN_KEY, true);

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requireAdmin = this.reflector.getAllAndOverride<boolean>(ADMIN_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const permission = this.reflector.getAllAndOverride<Permission | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requireAdmin && !permission) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const user = req.user;
    if (!user) throw new UnauthorizedException('Sign in required');
    if (user.status === 'disabled') {
      throw new ForbiddenException('Account is disabled');
    }

    if (requireAdmin) {
      if (!isAdmin(user.assignments.map((a) => a.role))) {
        throw new ForbiddenException('Admin role required');
      }
      return true;
    }

    const envParam = this.reflector.getAllAndOverride<string | undefined>(ENV_PARAM_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!envParam) {
      const ok = ENVIRONMENTS.some((environment) =>
        userHasPermission(user.assignments, environment, permission!),
      );
      if (!ok) throw new ForbiddenException(`Missing permission: ${permission}`);
      return true;
    }

    const environment = this.readEnvironment(req, envParam);
    if (!environment) {
      throw new ForbiddenException(`Environment is required (${envParam})`);
    }
    if (!userHasPermission(user.assignments, environment, permission!)) {
      throw new ForbiddenException(
        `Missing permission ${permission} on environment ${environment}`,
      );
    }
    return true;
  }

  private readEnvironment(req: AuthedRequest, envParam: string): Environment | null {
    const body = req.body as Record<string, unknown> | undefined;
    const query = req.query as Record<string, unknown> | undefined;
    const params = req.params as Record<string, unknown> | undefined;
    const raw = body?.[envParam] ?? query?.[envParam] ?? params?.[envParam];
    return typeof raw === 'string' ? (raw as Environment) : null;
  }
}

/** Imperative check for services that know the environment only after a DB lookup. */
export function assertPermission(
  user: SessionUser,
  environment: Environment,
  permission: Permission,
) {
  if (!userHasPermission(user.assignments, environment, permission)) {
    throw new ForbiddenException(`Missing permission ${permission} on environment ${environment}`);
  }
}
