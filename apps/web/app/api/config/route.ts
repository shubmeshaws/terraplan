import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

/** Public runtime config for the browser (WebSocket base URL, etc.). */
export function GET() {
  const http = env.API_PUBLIC_URL.replace(/\/$/, '');
  const ws = http.replace(/^http/, 'ws');
  return NextResponse.json({
    apiPublicUrl: http,
    locksWsUrl: `${ws}/api/v1/locks/ws`,
  });
}
