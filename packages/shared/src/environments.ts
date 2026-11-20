import { z } from 'zod';
import { envNameSchema } from './domain';

export const backendConfigSchema = z.object({
  type: z.literal('s3').default('s3'),
  bucket: z.string().trim().min(1).max(200),
  key: z.string().trim().min(1).max(500).optional(),
  region: z.string().trim().min(1).max(40).optional(),
  dynamodbTable: z.string().trim().min(1).max(200).optional(),
  encrypt: z.boolean().optional().default(true),
});
export type BackendConfig = z.infer<typeof backendConfigSchema>;

export const APPROVAL_ACTORS = ['anyone', 'planner', 'applier', 'admin'] as const;
export type ApprovalActor = (typeof APPROVAL_ACTORS)[number];

export const approvalPolicySchema = z.object({
  plan: z.enum(APPROVAL_ACTORS).default('anyone'),
  apply: z.enum(APPROVAL_ACTORS).default('applier'),
  destroy: z.enum(APPROVAL_ACTORS).default('admin'),
  approversRequired: z.coerce.number().int().min(0).max(10).default(0),
  allowedHours: z.string().trim().min(1).max(120).default('Anytime'),
  lockTimeoutMin: z.coerce.number().int().min(5).max(480).default(60),
});
export type ApprovalPolicy = z.infer<typeof approvalPolicySchema>;

const roleArnSchema = z
  .string()
  .trim()
  .regex(/^arn:aws:iam::\d{12}:role\/[\w+=,.@\-_/]+$/, 'must be an IAM role ARN');

const awsAccountIdSchema = z
  .string()
  .trim()
  .regex(/^\d{12}$/, 'must be a 12-digit AWS account id');

export const upsertEnvironmentSchema = z
  .object({
    name: envNameSchema,
    displayName: z.string().trim().max(80).optional().nullable(),
    repository: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[A-Za-z0-9._-]+$/, 'letters, digits, dot, dash and underscore only'),
    terraformDir: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .refine((p) => !p.includes('..') && !p.startsWith('/'), 'relative path only'),
    backendConfig: backendConfigSchema,
    awsAccountId: awsAccountIdSchema,
    roleArn: roleArnSchema,
    externalId: z.string().trim().min(1).max(200).optional().nullable(),
    sessionDurationSeconds: z.coerce.number().int().min(900).max(43_200).default(3600),
    terraformVersion: z
      .string()
      .trim()
      .regex(/^\d+\.\d+\.\d+(-[\w.]+)?$/, 'must be a semver like 1.9.8')
      .default('1.9.8'),
    variableFiles: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(200)
          .refine((p) => !p.includes('..') && !p.startsWith('/'), 'relative path only'),
      )
      .max(20)
      .default([]),
    approvalPolicy: approvalPolicySchema.default({}),
    enabled: z.boolean().default(true),
  })
  .superRefine((val, ctx) => {
    const accountFromArn = val.roleArn.split(':')[4];
    if (accountFromArn && accountFromArn !== val.awsAccountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['roleArn'],
        message: `role ARN account (${accountFromArn}) must match awsAccountId`,
      });
    }
  });

export type UpsertEnvironmentInput = z.infer<typeof upsertEnvironmentSchema>;

export interface EnvironmentConfigDto {
  id: string;
  name: string;
  displayName: string | null;
  repository: string;
  terraformDir: string;
  backendConfig: BackendConfig;
  awsAccountId: string;
  roleArn: string;
  externalId: string | null;
  sessionDurationSeconds: number;
  terraformVersion: string;
  variableFiles: string[];
  approvalPolicy: ApprovalPolicy;
  enabled: boolean;
  lastAssumedAt: string | null;
  lastAssumeError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssumeRoleResultDto {
  ok: boolean;
  accessKeyIdPreview?: string;
  expiration?: string;
  error?: string;
}
