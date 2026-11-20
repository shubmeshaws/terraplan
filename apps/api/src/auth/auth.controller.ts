import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { AuthProvider, SessionUser } from '@terraplan/shared';
import type { Request, Response } from 'express';
import { env } from '../env';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { createOAuthState, verifyOAuthState } from './oauth-state';
import { exchangeOAuthCode, googleAuthorizeUrl, googleConfigured } from './oauth.providers';
import { SESSION_COOKIE, signSession } from './session';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('providers')
  providers() {
    return this.auth.providers();
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: SessionUser) {
    return user;
  }

  /**
   * Short-lived copy of the session JWT for WebSocket auth (cookies aren't
   * sent cross-origin to the API WebSocket). Browser fetches this via the
   * Next proxy (cookie attached), then opens ws://api/.../locks/ws?token=.
   */
  @Get('ws-token')
  @UseGuards(AuthGuard)
  wsToken(@CurrentUser() user: SessionUser) {
    const token = signSession({ sub: user.id, email: user.email, name: user.name });
    return { token };
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Get('google')
  googleStart(@Res() res: Response) {
    if (!googleConfigured()) {
      throw new BadRequestException('Google SSO is not configured');
    }
    const state = createOAuthState('google');
    res.redirect(googleAuthorizeUrl(state));
  }

  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.finishOAuth('google', code, state, error, req, res);
  }

  private async finishOAuth(
    provider: AuthProvider,
    code: string | undefined,
    state: string | undefined,
    error: string | undefined,
    req: Request,
    res: Response,
  ) {
    if (error) {
      return res.redirect(
        `${env.WEB_PUBLIC_URL}/api/auth/session?error=${encodeURIComponent(error)}`,
      );
    }
    if (!code || !state || !verifyOAuthState(state, provider)) {
      return res.redirect(
        `${env.WEB_PUBLIC_URL}/api/auth/session?error=${encodeURIComponent('Invalid OAuth state')}`,
      );
    }
    try {
      const profile = await exchangeOAuthCode(provider, code);
      const user = await this.auth.upsertFromOAuth(profile, clientIp(req));
      const token = signSession({ sub: user.id, email: user.email, name: user.name });
      return res.redirect(
        `${env.WEB_PUBLIC_URL}/api/auth/session?token=${encodeURIComponent(token)}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign-in failed';
      return res.redirect(
        `${env.WEB_PUBLIC_URL}/api/auth/session?error=${encodeURIComponent(message)}`,
      );
    }
  }
}

function clientIp(req: Request): string | null {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0]!.trim();
  return req.socket.remoteAddress ?? null;
}
