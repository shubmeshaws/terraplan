/**
 * Assume an environment IAM role via STS. Uses the default AWS credential
 * chain of the caller (instance profile / task role / env) — never static
 * long-lived keys from the database.
 */
export interface AssumeRoleInput {
  roleArn: string;
  sessionName: string;
  durationSeconds?: number;
  externalId?: string | null;
  /** Optional region for the STS endpoint (defaults to AWS_REGION / us-east-1). */
  region?: string;
}

export interface AssumedCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: Date;
}

export async function assumeRole(input: AssumeRoleInput): Promise<AssumedCredentials> {
  // Dynamic import keeps simulate-mode runners working without AWS wiring.
  const { STSClient, AssumeRoleCommand } = await import('@aws-sdk/client-sts');
  const region =
    input.region || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
  const client = new STSClient({ region });
  const res = await client.send(
    new AssumeRoleCommand({
      RoleArn: input.roleArn,
      RoleSessionName: sanitizeSessionName(input.sessionName),
      DurationSeconds: input.durationSeconds ?? 3600,
      ExternalId: input.externalId || undefined,
    }),
  );
  const c = res.Credentials;
  if (!c?.AccessKeyId || !c.SecretAccessKey || !c.SessionToken || !c.Expiration) {
    throw new Error('STS AssumeRole returned incomplete credentials');
  }
  return {
    accessKeyId: c.AccessKeyId,
    secretAccessKey: c.SecretAccessKey,
    sessionToken: c.SessionToken,
    expiration: c.Expiration,
  };
}

function sanitizeSessionName(name: string): string {
  return name.replace(/[^\w+=,.@-]/g, '-').slice(0, 64) || 'terraplan';
}

/** Env vars Terraform / AWS SDK expect for temporary credentials. */
export function credentialsToEnv(creds: AssumedCredentials): Record<string, string> {
  return {
    AWS_ACCESS_KEY_ID: creds.accessKeyId,
    AWS_SECRET_ACCESS_KEY: creds.secretAccessKey,
    AWS_SESSION_TOKEN: creds.sessionToken,
    // Prevent accidental fall-through to long-lived keys on the host.
    AWS_PROFILE: '',
    AWS_SHARED_CREDENTIALS_FILE: '',
  };
}
