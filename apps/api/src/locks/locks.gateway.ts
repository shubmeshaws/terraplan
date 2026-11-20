import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { EnvironmentLockDto } from '@terraplan/shared';
import { WebSocketServer, WebSocket } from 'ws';
import { AuthService } from '../auth/auth.service';
import { SESSION_COOKIE, verifySession } from '../auth/session';
import { LocksService } from './locks.service';

/**
 * Live environment lock status over WebSocket.
 * Path: /api/v1/locks/ws  (query ?token= or Cookie: terraplan_session=)
 * Messages: JSON { type: 'snapshot'|'update', locks: EnvironmentLockDto[] }
 */
@Injectable()
export class LocksGateway implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(LocksGateway.name);
  private wss: WebSocketServer | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly locks: LocksService,
    private readonly auth: AuthService,
  ) {}

  onApplicationBootstrap() {
    const server = this.httpAdapterHost.httpAdapter.getHttpServer() as HttpServer;
    this.wss = new WebSocketServer({ server, path: '/api/v1/locks/ws' });

    this.wss.on('connection', (socket, req) => {
      void this.handleConnection(socket, req);
    });

    this.unsubscribe = this.locks.subscribe((locks) => this.broadcast(locks));
    this.logger.log('WebSocket locks gateway on /api/v1/locks/ws');
  }

  async onModuleDestroy() {
    this.unsubscribe?.();
    await new Promise<void>((resolve) => {
      if (!this.wss) return resolve();
      this.wss.close(() => resolve());
    });
  }

  private async handleConnection(socket: WebSocket, req: IncomingMessage) {
    try {
      const token = this.extractToken(req);
      if (!token) {
        socket.close(4401, 'unauthorized');
        return;
      }
      const claims = verifySession(token);
      await this.auth.getSessionUser(claims.sub);
    } catch {
      socket.close(4401, 'unauthorized');
      return;
    }

    try {
      const locks = await this.locks.list();
      this.send(socket, { type: 'snapshot', locks });
    } catch (err) {
      this.logger.warn(`failed to send lock snapshot: ${err}`);
    }
  }

  private broadcast(locks: EnvironmentLockDto[]) {
    if (!this.wss) return;
    const payload = JSON.stringify({ type: 'update', locks });
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
  }

  private send(socket: WebSocket, body: { type: string; locks: EnvironmentLockDto[] }) {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(body));
  }

  private extractToken(req: IncomingMessage): string | null {
    const url = new URL(req.url || '/', 'http://localhost');
    const q = url.searchParams.get('token');
    if (q) return q;

    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) return auth.slice(7);

    const cookie = req.headers.cookie || '';
    const match = cookie
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${SESSION_COOKIE}=`));
    return match ? decodeURIComponent(match.slice(SESSION_COOKIE.length + 1)) : null;
  }
}
