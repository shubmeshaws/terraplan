import type { NextRequest } from 'next/server';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';
/** SSE log streams can stay open for the life of a terraform run. */
export const maxDuration = 300;

const SESSION_COOKIE = 'terraplan_session';

function isSsePath(path: string[]): boolean {
  // runs/:id/logs/stream
  return (
    path.length >= 4 &&
    path[0] === 'runs' &&
    path[path.length - 2] === 'logs' &&
    path[path.length - 1] === 'stream'
  );
}

// Proxies browser calls to the NestJS API so the API URL is a runtime setting
// (not baked in at build time) and the browser never needs CORS.
async function proxy(req: NextRequest, { params }: { params: { path: string[] } }) {
  const sse = isSsePath(params.path);
  const target = new URL(
    `/api/v1/${params.path.map(encodeURIComponent).join('/')}`,
    env.API_INTERNAL_URL,
  );
  target.search = req.nextUrl.search;

  const headers = new Headers();
  const contentType = req.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  headers.set('accept', sse ? 'text/event-stream' : 'application/json');

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    headers.set('authorization', `Bearer ${token}`);
    headers.set('cookie', `${SESSION_COOKIE}=${token}`);
  }

  const fwd = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip');
  if (fwd) headers.set('x-forwarded-for', fwd);

  try {
    const res = await fetch(target, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : await req.text(),
      cache: 'no-store',
      // Keep OAuth 302s intact so the browser can leave for Bitbucket/Google.
      redirect: 'manual',
      // No short timeout for SSE — the stream stays open until the run finishes.
      signal: sse ? undefined : AbortSignal.timeout(15_000),
    });

    const outHeaders = new Headers();
    const ct = res.headers.get('content-type');
    if (ct) outHeaders.set('content-type', ct);
    if (sse) {
      outHeaders.set('cache-control', 'no-cache, no-transform');
      outHeaders.set('connection', 'keep-alive');
      outHeaders.set('x-accel-buffering', 'no');
    }
    // OAuth start endpoints return 302 to Bitbucket/Google — pass Location through.
    const location = res.headers.get('location');
    if (location) outHeaders.set('location', location);

    // If the API sets a session cookie (e.g. dev-login), mirror it onto the web origin.
    const setCookie = res.headers.getSetCookie?.() ?? [];
    for (const c of setCookie) {
      if (c.startsWith(`${SESSION_COOKIE}=`)) outHeaders.append('set-cookie', c);
    }

    return new Response(res.body, { status: res.status, headers: outHeaders });
  } catch {
    return Response.json(
      { statusCode: 502, message: 'The terraplan API is unreachable. Is apps/api running?' },
      { status: 502 },
    );
  }
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
