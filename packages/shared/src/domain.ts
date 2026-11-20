import { z } from 'zod';

export const ENVIRONMENTS = ['dev', 'qa', 'uat', 'staging', 'prod'] as const;
export const envNameSchema = z
  .string()
  .trim()
  .min(1, 'name is required')
  .max(200)
  .refine((s) => !/[\n\r]/.test(s), 'name cannot contain line breaks');
export const ACTIONS = ['plan', 'apply', 'destroy'] as const;
export const RUN_STATUSES = [
  'waiting_approval',
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
] as const;

export type Environment = string;
export type RunAction = (typeof ACTIONS)[number];
export type RunStatus = (typeof RUN_STATUSES)[number];

export const TERMINAL_STATUSES: readonly RunStatus[] = ['succeeded', 'failed', 'cancelled'];

/** Phrase the operator must type to confirm a destroy. */
export function destroyConfirmationPhrase(environment: Environment): string {
  return `destroy ${environment}`;
}

export const createRunSchema = z
  .object({
    repository: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[A-Za-z0-9._-]+$/, 'letters, digits, dot, dash and underscore only'),
    branch: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/^[A-Za-z0-9._/-]+$/, 'not a valid git branch name')
      .refine((b) => !b.includes('..') && !b.startsWith('-'), 'not a valid git branch name'),
    environment: envNameSchema,
    action: z.enum(ACTIONS),
    /** Required for apply — the succeeded plan run whose .tfplan will be applied exactly. */
    sourcePlanRunId: z.string().trim().min(1).max(64).optional(),
    /** Required for destroy — must equal `destroy <environment>`. */
    destroyConfirmation: z.string().trim().min(1).max(80).optional(),
    pullRequestId: z.coerce.number().int().positive().optional(),
    pullRequestUrl: z.string().url().max(500).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.action === 'apply' && !val.sourcePlanRunId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourcePlanRunId'],
        message: 'apply requires sourcePlanRunId (the plan run to apply exactly)',
      });
    }
    if (val.action === 'destroy') {
      const expected = destroyConfirmationPhrase(val.environment);
      if (val.destroyConfirmation !== expected) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['destroyConfirmation'],
          message: `type "${expected}" to confirm destroy`,
        });
      }
    }
  });

export type CreateRunInput = z.infer<typeof createRunSchema>;

export const listRunsQuerySchema = z.object({
  environment: envNameSchema.optional(),
  action: z.enum(ACTIONS).optional(),
  status: z.enum(RUN_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type ListRunsQuery = z.infer<typeof listRunsQuerySchema>;

export interface WaitingRunDto {
  runId: string;
  action: RunAction;
  branch: string;
  repository: string;
  triggeredBy: string;
  createdAt: string;
}

export interface RunDto {
  id: string;
  repository: string;
  branch: string;
  environment: Environment;
  action: RunAction;
  status: RunStatus;
  triggeredBy: string;
  commitSha: string | null;
  approvedBy: string | null;
  planSummary: string | null;
  output: string | null;
  error: string | null;
  planFileKey: string | null;
  planJsonKey: string | null;
  logFileKey: string | null;
  terraformVersion: string | null;
  sourcePlanRunId: string | null;
  pullRequestId: number | null;
  pullRequestUrl: string | null;
  prCommentId: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface EnvironmentLockDto {
  environment: Environment;
  held: boolean;
  runId: string | null;
  action: RunAction | null;
  branch: string | null;
  repository: string | null;
  status: RunStatus | null;
  holder: string | null;
  acquiredAt: string | null;
  startedAt: string | null;
  /** Runs queued / delayed waiting for this environment's exclusive lock. */
  waiting: WaitingRunDto[];
}

export interface HealthCheck {
  status: 'ok' | 'error';
  latencyMs?: number;
  error?: string;
}

export interface HealthReport {
  status: 'ok' | 'degraded';
  service: string;
  version: string;
  uptimeSeconds: number;
  timestamp: string;
  checks: Record<string, HealthCheck>;
}
