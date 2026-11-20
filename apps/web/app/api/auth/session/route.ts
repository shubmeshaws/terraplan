import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

const COOKIE = 'terraplan_session';
const MAX_AGE = 60 * 60 * 24 * 7;

/**
 * OAuth completes on the API, then redirects here with ?token= so the session
 * cookie is set on the web origin (same host the browser calls /api/v1 on).
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  const err = req.nextUrl.searchParams.get('error');
  if (err) {
    return NextResponse.redirect(new URL(`/?authError=${encodeURIComponent(err)}`, req.url));
  }
  if (!token) {
    return NextResponse.redirect(new URL('/?authError=Missing%20session%20token', req.url));
  }

  // Confirm the token is valid before storing it.
  try {
    const res = await fetch(new URL('/api/v1/auth/me', env.API_INTERNAL_URL), {
      headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      return NextResponse.redirect(new URL('/?authError=Invalid%20session', req.url));
    }
  } catch {
    return NextResponse.redirect(new URL('/?authError=API%20unreachable', req.url));
  }

  // Use a query flag (not #hash) — many clients drop fragments on 302 Location.
  const redirect = NextResponse.redirect(new URL('/?signedIn=1', req.url));
  redirect.cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  });
  return redirect;
}

/** Dev-login / client handoff: body { token } → set cookie. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { token?: string };
  if (!body.token) {
    return Response.json({ message: 'token is required' }, { status: 400 });
  }
  const res = Response.json({ ok: true });
  res.headers.append(
    'set-cookie',
    `${COOKIE}=${body.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${
      env.NODE_ENV === 'production' ? '; Secure' : ''
    }`,
  );
  return res;
}

export async function DELETE() {
  const res = Response.json({ ok: true });
  res.headers.append(
    'set-cookie',
    `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${
      env.NODE_ENV === 'production' ? '; Secure' : ''
    }`,
  );
  return res;
}
