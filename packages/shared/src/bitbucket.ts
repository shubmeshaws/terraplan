import { z } from 'zod';
import { envNameSchema } from './domain';

export const BITBUCKET_AUTH_MODES = ['oauth_consumer', 'app_password'] as const;
export type BitbucketAuthMode = (typeof BITBUCKET_AUTH_MODES)[number];

export const oauthConsumerCredentialsSchema = z.object({
  clientId: z.string().trim().min(1).max(200),
  clientSecret: z.string().trim().min(1).max(200),
});

export const appPasswordCredentialsSchema = z.object({
  username: z.string().trim().min(1).max(100),
  appPassword: z.string().trim().min(1).max(200),
});

export type OAuthConsumerCredentials = z.infer<typeof oauthConsumerCredentialsSchema>;
export type AppPasswordCredentials = z.infer<typeof appPasswordCredentialsSchema>;
export type BitbucketCredentials = OAuthConsumerCredentials | AppPasswordCredentials;

export const upsertBitbucketConnectionSchema = z
  .object({
    workspace: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[A-Za-z0-9._-]+$/, 'invalid workspace slug'),
    authMode: z.enum(BITBUCKET_AUTH_MODES),
    clientId: z.string().trim().min(1).max(200).optional(),
    clientSecret: z.string().trim().min(1).max(200).optional(),
    username: z.string().trim().min(1).max(100).optional(),
    appPassword: z.string().trim().min(1).max(200).optional(),
    webhookSecret: z.string().trim().max(200).optional().nullable(),
    postPlanComments: z.boolean().default(true),
    autoPlanOnPr: z.boolean().default(false),
    defaultPlanEnvironment: envNameSchema.default('dev'),
  })
  .superRefine((v, ctx) => {
    if (v.authMode === 'oauth_consumer') {
      if (!v.clientId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['clientId'], message: 'required' });
      }
      if (!v.clientSecret) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['clientSecret'], message: 'required' });
      }
    } else {
      if (!v.username) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['username'], message: 'required' });
      }
      if (!v.appPassword) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['appPassword'], message: 'required' });
      }
    }
  });

export type UpsertBitbucketConnectionInput = z.infer<typeof upsertBitbucketConnectionSchema>;

export interface BitbucketConnectionDto {
  connected: boolean;
  workspace: string | null;
  authMode: BitbucketAuthMode | null;
  status: string;
  postPlanComments: boolean;
  autoPlanOnPr: boolean;
  defaultPlanEnvironment: string;
  webhookUrl: string;
  webhookSecretSet: boolean;
  /** Masked previews only — never the full secret. */
  clientIdPreview: string | null;
  usernamePreview: string | null;
  lastSyncAt: string | null;
  lastTestAt: string | null;
  lastError: string | null;
  connectedById: string | null;
  updatedAt: string | null;
}

export interface BitbucketRepoDto {
  slug: string;
  name: string;
  fullName: string;
  description: string | null;
  isPrivate: boolean;
  defaultBranch: string | null;
  htmlUrl: string;
  updatedOn: string | null;
}

export interface BitbucketBranchDto {
  name: string;
  commitSha: string | null;
  commitUrl: string | null;
}

export interface BitbucketPullRequestDto {
  id: number;
  title: string;
  state: string;
  sourceBranch: string;
  destinationBranch: string;
  author: string | null;
  commitSha: string | null;
  htmlUrl: string;
  updatedOn: string | null;
}

export interface BitbucketCommitDto {
  sha: string;
  shortSha: string;
  message: string;
  author: string | null;
  date: string | null;
  htmlUrl: string;
}

export interface BitbucketWebhookDeliveryDto {
  id: string;
  event: string;
  deliveryId: string | null;
  repository: string | null;
  pullRequestId: number | null;
  result: string;
  error: string | null;
  createdAt: string;
}

export function maskSecret(value: string | null | undefined, keep = 4): string | null {
  if (!value) return null;
  if (value.length <= keep) return '••••';
  return `${'•'.repeat(Math.min(12, value.length - keep))}${value.slice(-keep)}`;
}
