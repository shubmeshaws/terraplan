import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { SessionUser } from '@terraplan/shared';
import { AuthService } from './auth.service';
import { SESSION_COOKIE, verifySession } from './session';

export type AuthedRequest = Request & { user?: SessionUser };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = this.extractToken(req);
    if (!token) throw new UnauthorizedException('Sign in required');
    try {
      const claims = verifySession(token);
      const user = await this.auth.getSessionUser(claims.sub);
      req.user = user;
      void this.auth.touchLastActive(user.id);
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired session');
    }
  }

  private extractToken(req: AuthedRequest): string | null {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) return header.slice(7);
    const cookies = req.cookies as Record<string, string> | undefined;
    return cookies?.[SESSION_COOKIE] ?? null;
  }
}
