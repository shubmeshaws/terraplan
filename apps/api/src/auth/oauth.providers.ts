import { BadRequestException } from '@nestjs/common';
import type { AuthProvider } from '@terraplan/shared';
import { env } from '../env';

export interface OAuthProfile {
  provider: AuthProvider;
  providerId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export function googleConfigured(): boolean {
  return !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

/** Google redirects here — must match the browser origin (web port), proxied to the API. */
export function oauthRedirectUri(provider: AuthProvider): string {
  return `${env.WEB_PUBLIC_URL}/api/v1/auth/${provider}/callback`;
}

export function googleAuthorizeUrl(state: string): string {
  if (!googleConfigured()) {
    throw new BadRequestException('Google SSO is not configured');
  }
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id', env.GOOGLE_CLIENT_ID!);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('redirect_uri', oauthRedirectUri('google'));
  u.searchParams.set('scope', 'openid email profile');
  u.searchParams.set('access_type', 'online');
  u.searchParams.set('prompt', 'select_account');
  u.searchParams.set('state', state);
  return u.toString();
}

async function exchangeGoogle(code: string): Promise<OAuthProfile> {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: oauthRedirectUri('google'),
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) throw new BadRequestException('Google token exchange failed');
  const token = (await tokenRes.json()) as { access_token: string };
  const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!profileRes.ok) throw new BadRequestException('Could not load Google profile');
  const profile = (await profileRes.json()) as {
    sub: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };
  if (!profile.email || profile.email_verified === false) {
    throw new BadRequestException('Google account email is missing or unverified');
  }
  return {
    provider: 'google',
    providerId: profile.sub,
    email: profile.email.toLowerCase(),
    name: profile.name || profile.email.split('@')[0],
    avatarUrl: profile.picture ?? null,
  };
}

export async function exchangeOAuthCode(
  provider: AuthProvider,
  code: string,
): Promise<OAuthProfile> {
  if (provider === 'google') return exchangeGoogle(code);
  throw new BadRequestException(`Unsupported provider: ${provider}`);
}
