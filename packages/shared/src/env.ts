import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';

/**
 * Loads the monorepo's root `.env` (the folder holding pnpm-workspace.yaml) no
 * matter which app directory a process starts in. Variables already present
 * in the environment win, so Docker/CI settings are never overridden.
 */
export function loadWorkspaceEnv(startDir: string = process.cwd()): string | null {
  let dir = startDir;
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) {
      const file = join(dir, '.env');
      if (!existsSync(file)) return null;
      loadDotenv({ path: file });
      return file;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const nodeEnv = z.enum(['development', 'test', 'production']).default('development');
const logLevel = z.enum(['debug', 'info', 'warn', 'error']).default('info');
const port = z.coerce.number().int().min(1).max(65535);

const postgresUrl = z
  .string()
  .url()
  .refine((v) => v.startsWith('postgres://') || v.startsWith('postgresql://'), {
    message: 'must be a postgres:// or postgresql:// URL',
  });

const redisUrl = z
  .string()
  .url()
  .refine((v) => v.startsWith('redis://') || v.startsWith('rediss://'), {
    message: 'must be a redis:// or rediss:// URL',
  });

const optionalSecret = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const boolish = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => {
    if (typeof v === 'boolean') return v;
    if (!v) return false;
    return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
  });

export const apiEnvSchema = z
  .object({
    NODE_ENV: nodeEnv,
    LOG_LEVEL: logLevel,
    API_PORT: port.default(4000),
    DATABASE_URL: postgresUrl,
    REDIS_URL: redisUrl,
    CORS_ORIGIN: z
      .string()
      .default('http://localhost:3005')
      .transform((v) =>
        v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    // Public URL of the API (webhooks, internal docs).
    API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
    // Browser origin (OAuth redirect_uri + post-login handoff). Use the web port, e.g. 3006.
    WEB_PUBLIC_URL: z.string().url().default('http://localhost:3005'),
    SESSION_SECRET: z
      .string()
      .min(32, 'must be at least 32 characters')
      .default('dev-only-change-me-terraplan-session-secret'),
    SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(168),
    // Google SSO (required for sign-in).
    GOOGLE_CLIENT_ID: optionalSecret,
    GOOGLE_CLIENT_SECRET: optionalSecret,
    // First admin email seeded / auto-promoted on first login.
    AUTH_BOOTSTRAP_ADMIN_EMAIL: z.preprocess(
      (v) => (typeof v === 'string' && v.trim() ? v.trim().toLowerCase() : undefined),
      z.string().email().optional(),
    ),
    // If true, unknown emails that pass OAuth become Viewer on every env.
    AUTH_ALLOW_AUTO_JOIN: boolish.default(false),
    // AES key material for Bitbucket workspace credential encryption. Falls back to SESSION_SECRET.
    CREDENTIALS_ENCRYPTION_KEY: optionalSecret,
    // Optional: API can also read artifact metadata; uploads happen in the runner.
    ARTIFACTS_S3_BUCKET: optionalSecret,
    ARTIFACTS_S3_REGION: z.string().min(1).default('us-east-1'),
    ARTIFACTS_S3_PREFIX: z.string().default('terraplan/'),
    ARTIFACTS_LOCAL_DIR: z.string().min(1).default('./.runner-artifacts'),
    // Platform guardrails
    RATE_LIMIT_RUNS_PER_HOUR: z.coerce.number().int().min(1).max(10_000).default(30),
    USER_MAX_CONCURRENT_RUNS: z.coerce.number().int().min(1).max(100).default(3),
    RUN_TIMEOUT_SECONDS: z.coerce.number().int().min(60).max(86_400).default(3600),
    TF_DENIED_FLAGS: z.string().optional(),
    SECRET_SCAN_FAIL_ON_HIGH: boolish.default(true),
    // Notifications
    SLACK_WEBHOOK_URL: optionalSecret,
    TEAMS_WEBHOOK_URL: optionalSecret,
    NOTIFY_ON: z
      .string()
      .default('waiting_approval,failed,succeeded')
      .transform((v) =>
        v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    // Metrics
    METRICS_ENABLED: boolish.default(true),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.NODE_ENV === 'production' && cfg.SESSION_SECRET.includes('dev-only')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SESSION_SECRET'],
        message: 'must be set to a strong secret in production',
      });
    }
    const google = !!(cfg.GOOGLE_CLIENT_ID && cfg.GOOGLE_CLIENT_SECRET);
    if (cfg.NODE_ENV === 'production' && !google) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GOOGLE_CLIENT_ID'],
        message: 'Google OAuth credentials are required in production',
      });
    }
    if (
      (cfg.GOOGLE_CLIENT_ID && !cfg.GOOGLE_CLIENT_SECRET) ||
      (!cfg.GOOGLE_CLIENT_ID && cfg.GOOGLE_CLIENT_SECRET)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GOOGLE_CLIENT_SECRET'],
        message: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must both be set',
      });
    }
  });

export const runnerEnvSchema = z.object({
  NODE_ENV: nodeEnv,
  LOG_LEVEL: logLevel,
  DATABASE_URL: postgresUrl,
  REDIS_URL: redisUrl,
  RUNNER_MODE: z.enum(['simulate', 'terraform']).default('simulate'),
  RUNNER_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(2),
  RUNNER_HEALTH_PORT: port.default(4100),
  /** Fallback binary name/path when a pinned version is not cached yet. */
  TERRAFORM_BIN: z.string().min(1).default('terraform'),
  /** Cache dir for downloaded terraform_{version} binaries. */
  TERRAFORM_VERSIONS_DIR: z.string().min(1).default('./.terraform-versions'),
  /** Scratch clones live under this dir (one isolated temp dir per run). */
  TERRAFORM_WORKSPACES_DIR: z.string().min(1).default('./.runner-workspaces'),
  /** Decrypt Bitbucket credentials for git clone (same key as API). */
  SESSION_SECRET: z
    .string()
    .min(32, 'must be at least 32 characters')
    .default('dev-only-change-me-terraplan-session-secret'),
  CREDENTIALS_ENCRYPTION_KEY: optionalSecret,
  /** Durable plan/log storage. When bucket is unset, files go to ARTIFACTS_LOCAL_DIR. */
  ARTIFACTS_S3_BUCKET: optionalSecret,
  ARTIFACTS_S3_REGION: z.string().min(1).default('us-east-1'),
  ARTIFACTS_S3_PREFIX: z.string().default('terraplan/'),
  ARTIFACTS_LOCAL_DIR: z.string().min(1).default('./.runner-artifacts'),
  RUN_TIMEOUT_SECONDS: z.coerce.number().int().min(60).max(86_400).default(3600),
  TF_DENIED_FLAGS: z.string().optional(),
  SECRET_SCAN_FAIL_ON_HIGH: boolish.default(true),
  SLACK_WEBHOOK_URL: optionalSecret,
  TEAMS_WEBHOOK_URL: optionalSecret,
  NOTIFY_ON: z
    .string()
    .default('waiting_approval,failed,succeeded')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
});

export const webEnvSchema = z.object({
  NODE_ENV: nodeEnv,
  WEB_PORT: port.default(3005),
  API_INTERNAL_URL: z.string().url().default('http://localhost:4000'),
  /** Browser-reachable API origin (WebSocket locks). Defaults to API_INTERNAL_URL. */
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;
export type RunnerEnv = z.infer<typeof runnerEnvSchema>;
export type WebEnv = z.infer<typeof webEnvSchema>;

/**
 * Validates `source` against `schema` and fails fast with a readable list of
 * problems, so a misconfigured service never starts half-working.
 */
export function parseEnv<T extends z.ZodTypeAny>(
  schema: T,
  service: string,
  source: Record<string, string | undefined> = process.env,
): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map(
      (i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`,
    );
    throw new Error(`[${service}] Invalid environment configuration:\n${lines.join('\n')}`);
  }
  return result.data;
}
