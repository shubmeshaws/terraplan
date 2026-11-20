import type {
  AppPasswordCredentials,
  BitbucketAuthMode,
  BitbucketCredentials,
  OAuthConsumerCredentials,
  UpsertBitbucketConnectionInput,
} from '@terraplan/shared';
import { decryptSecret, encryptSecret, encryptionKeyFromSecret } from '@terraplan/shared';
import { env } from '../env';

export function credentialsKey() {
  return encryptionKeyFromSecret(env.CREDENTIALS_ENCRYPTION_KEY || env.SESSION_SECRET);
}

export function credentialsFromInput(input: UpsertBitbucketConnectionInput): BitbucketCredentials {
  if (input.authMode === 'oauth_consumer') {
    return {
      clientId: input.clientId!,
      clientSecret: input.clientSecret!,
    } satisfies OAuthConsumerCredentials;
  }
  return {
    username: input.username!,
    appPassword: input.appPassword!,
  } satisfies AppPasswordCredentials;
}

export function sealCredentials(creds: BitbucketCredentials): string {
  return encryptSecret(JSON.stringify(creds), credentialsKey());
}

export function openCredentials(
  ciphertext: string,
  authMode: BitbucketAuthMode,
): BitbucketCredentials {
  const raw = JSON.parse(decryptSecret(ciphertext, credentialsKey())) as BitbucketCredentials;
  if (authMode === 'oauth_consumer') {
    const c = raw as OAuthConsumerCredentials;
    if (!c.clientId || !c.clientSecret) throw new Error('Invalid oauth_consumer credentials');
    return c;
  }
  const c = raw as AppPasswordCredentials;
  if (!c.username || !c.appPassword) throw new Error('Invalid app_password credentials');
  return c;
}
