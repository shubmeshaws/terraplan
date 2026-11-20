import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { SessionUser, UpsertBitbucketConnectionInput } from '@terraplan/shared';
import { upsertBitbucketConnectionSchema } from '@terraplan/shared';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RbacGuard, RequireAdmin, RequirePermission } from '../auth/rbac.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { BitbucketService } from './bitbucket.service';

@Controller('bitbucket')
@UseGuards(AuthGuard, RbacGuard)
export class BitbucketController {
  constructor(private readonly bitbucket: BitbucketService) {}

  @Get('connection')
  @RequireAdmin()
  connection() {
    return this.bitbucket.getConnectionDto();
  }

  @Put('connection')
  @RequireAdmin()
  upsert(
    @CurrentUser() actor: SessionUser,
    @Body(new ZodValidationPipe(upsertBitbucketConnectionSchema))
    body: UpsertBitbucketConnectionInput,
    @Req() req: Request,
  ) {
    return this.bitbucket.upsertConnection(actor, body, clientIp(req));
  }

  @Delete('connection')
  @RequireAdmin()
  disconnect(@CurrentUser() actor: SessionUser, @Req() req: Request) {
    return this.bitbucket.disconnect(actor, clientIp(req));
  }

  @Post('connection/test')
  @RequireAdmin()
  test(@CurrentUser() actor: SessionUser, @Req() req: Request) {
    return this.bitbucket.testConnection(actor, clientIp(req));
  }

  @Post('connection/sync')
  @RequireAdmin()
  sync(@CurrentUser() actor: SessionUser, @Req() req: Request) {
    return this.bitbucket.sync(actor, clientIp(req));
  }

  @Get('webhook-deliveries')
  @RequireAdmin()
  deliveries(@Query('limit') limit?: string) {
    return this.bitbucket.listWebhookDeliveries(limit ? Number(limit) : 50);
  }

  @Get('repositories')
  @RequirePermission('runs:view')
  repositories() {
    return this.bitbucket.listRepositories();
  }

  @Get('repositories/:repo/branches')
  @RequirePermission('runs:view')
  branches(@Param('repo') repo: string) {
    return this.bitbucket.listBranches(repo);
  }

  @Get('repositories/:repo/pull-requests')
  @RequirePermission('runs:view')
  pullRequests(@Param('repo') repo: string) {
    return this.bitbucket.listPullRequests(repo);
  }

  @Get('repositories/:repo/commits')
  @RequirePermission('runs:view')
  commits(@Param('repo') repo: string, @Query('branch') branch?: string) {
    return this.bitbucket.listCommits(repo, branch);
  }
}

function clientIp(req: Request): string | null {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0]!.trim();
  return req.socket.remoteAddress ?? null;
}
