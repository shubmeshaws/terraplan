import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Environment, SessionUser, UpsertEnvironmentInput } from '@terraplan/shared';
import { envNameSchema, upsertEnvironmentSchema } from '@terraplan/shared';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RbacGuard, RequireAdmin } from '../auth/rbac.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { EnvironmentsService } from './environments.service';

@Controller('environments')
@UseGuards(AuthGuard, RbacGuard)
export class EnvironmentsController {
  constructor(private readonly environments: EnvironmentsService) {}

  @Get()
  @RequireAdmin()
  list() {
    return this.environments.list();
  }

  @Get('missing')
  @RequireAdmin()
  missing() {
    return this.environments.missingNames();
  }

  @Get(':name')
  @RequireAdmin()
  get(@Param('name') name: string) {
    return this.environments.get(parseEnv(name));
  }

  @Put(':name')
  @RequireAdmin()
  upsert(
    @Param('name') name: string,
    @CurrentUser() actor: SessionUser,
    @Body(new ZodValidationPipe(upsertEnvironmentSchema)) body: UpsertEnvironmentInput,
    @Req() req: Request,
  ) {
    const envName = parseEnv(name);
    if (body.name !== envName) {
      body = { ...body, name: envName };
    }
    return this.environments.upsert(actor, body, clientIp(req));
  }

  @Delete(':name')
  @RequireAdmin()
  remove(@Param('name') name: string, @CurrentUser() actor: SessionUser, @Req() req: Request) {
    return this.environments.remove(actor, parseEnv(name), clientIp(req));
  }

  @Post(':name/test-assume')
  @RequireAdmin()
  testAssume(
    @Param('name') name: string,
    @CurrentUser() actor: SessionUser,
    @Req() req: Request,
  ) {
    return this.environments.testAssume(actor, parseEnv(name), clientIp(req));
  }
}

function parseEnv(name: string): Environment {
  const parsed = envNameSchema.safeParse(name);
  if (!parsed.success) {
    throw new BadRequestException(`Invalid environment: ${name}`);
  }
  return parsed.data;
}

function clientIp(req: Request): string | null {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0]!.trim();
  return req.socket.remoteAddress ?? null;
}
