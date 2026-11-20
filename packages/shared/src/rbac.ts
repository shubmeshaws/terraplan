import { z } from 'zod';
import { envNameSchema, type Environment, type RunAction } from './domain';

export const ROLE_NAMES = ['Viewer', 'Planner', 'Applier', 'Admin'] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

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
 * Mirrors the "Roles and permissions" matrix in the UI.
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

/** Highest-ranked role across every environment assignment. */
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
  environment: Environment;
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
  environment: envNameSchema,
  role: z.enum(ROLE_NAMES),
});

export const inviteUserSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(200)
    .transform((e) => e.toLowerCase()),
  name: z.string().trim().min(1).max(100).optional(),
  assignments: z.array(roleAssignmentInputSchema).min(1).max(50),
});

export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const updateUserRolesSchema = z.object({
  assignments: z.array(roleAssignmentInputSchema).min(1).max(50),
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

/** Builds the per-environment permission map returned to the client. */
export function permissionMap(
  assignments: RoleAssignmentDto[],
): Partial<Record<Environment, Permission[]>> {
  const map: Partial<Record<Environment, Permission[]>> = {};
  for (const a of assignments) {
    map[a.environment] = [...permissionsFor(a.role, a.environment)];
  }
  return map;
}
