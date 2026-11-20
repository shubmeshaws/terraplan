import jwt from 'jsonwebtoken';
import { env } from '../env';

export const SESSION_COOKIE = 'terraplan_session';

export interface SessionClaims {
  sub: string;
  email: string;
  name: string;
}

export function signSession(claims: SessionClaims): string {
  return jwt.sign({ email: claims.email, name: claims.name }, env.SESSION_SECRET, {
    subject: claims.sub,
    expiresIn: `${env.SESSION_TTL_HOURS}h`,
  });
}

export function verifySession(token: string): SessionClaims {
  const payload = jwt.verify(token, env.SESSION_SECRET) as jwt.JwtPayload;
  if (!payload.sub || typeof payload.email !== 'string' || typeof payload.name !== 'string') {
    throw new Error('Invalid session payload');
  }
  return { sub: payload.sub, email: payload.email, name: payload.name };
}

export function sessionCookieOptions(maxAgeSec: number) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSec,
  };
}
