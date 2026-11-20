import { z } from 'zod';
import { ENVIRONMENTS, envNameSchema, type Environment, type RunAction } from './domain';

export const ROLE_NAMES = ['Viewer', 'Planner', 'Applier', 'Admin'] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

/** Roles shown in the product UI (global memberships). */
export const DEFAULT_ROLES = ['Admin', 'Viewer'] as const;
export type DefaultRoleName = (typeof DEFAULT_ROLES)[number];

export const AUTH_PROVIDERS = ['bitbucket', 'google'] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

export const USER_STATUSES = ['invited', 'active', 'disabled'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const PERMISSIONS = [
  'runs:view',
  'runs:plan',
  'runs:apply',
  'runs:destroy',
  'runs:approve',
  'locks:break',
  'users:manage',
  'audit:view',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Role rank used when comparing assignments (Admin wins). */
export const ROLE_RANK: Record<RoleName, number> = {
  Viewer: 1,
  Planner: 2,
  Applier: 3,
  Admin: 4,
};

/**
 * Permissions a role grants on a given environment.
 * Admin / Viewer are global; Planner / Applier kept for legacy rows.
 */
export function permissionsFor(role: RoleName, environment: Environment): readonly Permission[] {
  const view: Permission[] = ['runs:view'];
  if (role === 'Viewer') return view;

  const planLow: Environment[] = ['dev', 'qa', 'uat'];
  const applyLow: Environment[] = ['dev', 'qa', 'uat', 'staging'];

  if (role === 'Planner') {
    return planLow.includes(environment) ? [...view, 'runs:plan'] : view;
  }

  if (role === 'Applier') {
    const perms: Permission[] = [...view, 'runs:plan', 'audit:view'];
    if (applyLow.includes(environment)) perms.push('runs:apply');
    return perms;
  }

  // Admin: everything on every environment.
  return [...PERMISSIONS];
}

export function hasPermission(
  role: RoleName | null | undefined,
  environment: Environment,
  permission: Permission,
): boolean {
  if (!role) return false;
  return permissionsFor(role, environment).includes(permission);
}

/**
 * Global multi-role check: Admin on any assignment unlocks everything;
 * otherwise union permissions from every role against the target environment.
 */
export function userHasPermission(
  assignments: Iterable<{ role: RoleName; environment?: string }>,
  environment: Environment,
  permission: Permission,
): boolean {
  const roles: RoleName[] = [];
  for (const a of assignments) roles.push(a.role);
  if (isAdmin(roles)) return true;
  return roles.some((role) => hasPermission(role, environment, permission));
}

/** Highest-ranked role across every assignment. */
export function highestRole(roles: Iterable<RoleName>): RoleName | null {
  let best: RoleName | null = null;
  for (const r of roles) {
    if (!best || ROLE_RANK[r] > ROLE_RANK[best]) best = r;
  }
  return best;
}

export function isAdmin(roles: Iterable<RoleName>): boolean {
  return highestRole(roles) === 'Admin';
}

/** Permission required to create/approve a run of this action. */
export function permissionForAction(action: RunAction): Permission {
  switch (action) {
    case 'plan':
      return 'runs:plan';
    case 'apply':
      return 'runs:apply';
    case 'destroy':
      return 'runs:destroy';
  }
}

export interface RoleAssignmentDto {
  environment: Environment | '*';
  role: RoleName;
}

export interface UserDto {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  provider: AuthProvider | null;
  status: UserStatus;
  assignments: RoleAssignmentDto[];
  /** Distinct role names (Admin / Viewer / …). */
  roles: RoleName[];
  highestRole: RoleName | null;
  invitedById: string | null;
  lastActiveAt: string | null;
  createdAt: string;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  provider: AuthProvider | null;
  status: UserStatus;
  assignments: RoleAssignmentDto[];
  roles: RoleName[];
  highestRole: RoleName | null;
  permissions: Partial<Record<Environment, Permission[]>>;
}

export interface AuditLogDto {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  environment: Environment | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  result: string;
  createdAt: string;
}

export const roleAssignmentInputSchema = z.object({
  environment: envNameSchema.or(z.literal('*')).default('*'),
  role: z.enum(ROLE_NAMES),
});

const defaultRoleSchema = z.enum(DEFAULT_ROLES);

/** Preferred invite/update payload: one or more global roles. */
export const inviteUserSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email()
      .max(200)
      .transform((e) => e.toLowerCase()),
    name: z.string().trim().min(1).max(100).optional(),
    roles: z.array(defaultRoleSchema).min(1).max(10).optional(),
    /** Legacy per-environment assignments — still accepted. */
    assignments: z.array(roleAssignmentInputSchema).min(1).max(50).optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.roles?.length && !val.assignments?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['roles'],
        message: 'Pick at least one role (Admin or Viewer)',
      });
    }
  });

export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const updateUserRolesSchema = z
  .object({
    roles: z.array(defaultRoleSchema).min(1).max(10).optional(),
    assignments: z.array(roleAssignmentInputSchema).min(1).max(50).optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.roles?.length && !val.assignments?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['roles'],
        message: 'Pick at least one role (Admin or Viewer)',
      });
    }
  });

export type UpdateUserRolesInput = z.infer<typeof updateUserRolesSchema>;

export const updateUserStatusSchema = z.object({
  status: z.enum(['active', 'disabled']),
});

export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;

export const listUsersQuerySchema = z.object({
  status: z.enum(USER_STATUSES).optional(),
  q: z.string().trim().max(100).optional(),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

export const listAuditLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  action: z.string().trim().max(100).optional(),
});

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;

export const exportAuditLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(10_000).default(1000),
  action: z.string().trim().max(100).optional(),
  format: z.enum(['csv', 'json']).default('csv'),
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
});

export type ExportAuditLogsQuery = z.infer<typeof exportAuditLogsQuerySchema>;

/** Normalize invite/update input into distinct global role assignments. */
export function normalizeRoleAssignments(
  input: { roles?: DefaultRoleName[]; assignments?: RoleAssignmentDto[] },
): RoleAssignmentDto[] {
  if (input.roles?.length) {
    const unique = [...new Set(input.roles)];
    return unique.map((role) => ({ environment: '*' as const, role }));
  }
  const byRole = new Map<RoleName, RoleAssignmentDto>();
  for (const a of input.assignments || []) {
    const prev = byRole.get(a.role);
    if (!prev || ROLE_RANK[a.role] >= ROLE_RANK[prev.role]) {
      byRole.set(a.role, { environment: '*', role: a.role });
    }
  }
  return [...byRole.values()];
}

/** Builds the per-environment permission map returned to the client. */
export function permissionMap(
  assignments: RoleAssignmentDto[],
): Partial<Record<Environment, Permission[]>> {
  const map: Partial<Record<Environment, Permission[]>> = {};
  for (const environment of ENVIRONMENTS) {
    const set = new Set<Permission>();
    for (const a of assignments) {
      for (const p of permissionsFor(a.role, environment)) set.add(p);
    }
    map[environment] = [...set];
  }
  return map;
}
