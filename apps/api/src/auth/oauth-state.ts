import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../env';

/** Short-lived signed state for OAuth CSRF protection. */
export function createOAuthState(provider: string): string {
  const nonce = randomBytes(16).toString('hex');
  const exp = Math.floor(Date.now() / 1000) + 600;
  const body = `${provider}.${nonce}.${exp}`;
  const sig = createHmac('sha256', env.SESSION_SECRET).update(body).digest('hex');
  return `${body}.${sig}`;
}

export function verifyOAuthState(state: string, expectedProvider: string): boolean {
  const parts = state.split('.');
  if (parts.length !== 4) return false;
  const [provider, nonce, exp, sig] = parts;
  if (provider !== expectedProvider || !nonce || !exp || !sig) return false;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return false;
  const body = `${provider}.${nonce}.${exp}`;
  const expected = createHmac('sha256', env.SESSION_SECRET).update(body).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}
