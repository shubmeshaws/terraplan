import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type {
  ExportAuditLogsQuery,
  InviteUserInput,
  ListAuditLogsQuery,
  ListUsersQuery,
  SessionUser,
  UpdateUserRolesInput,
  UpdateUserStatusInput,
} from '@terraplan/shared';
import {
  exportAuditLogsQuerySchema,
  inviteUserSchema,
  listAuditLogsQuerySchema,
  listUsersQuerySchema,
  updateUserRolesSchema,
  updateUserStatusSchema,
} from '@terraplan/shared';
import type { Request, Response } from 'express';
import { AuditService } from '../audit/audit.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RbacGuard, RequireAdmin } from '../auth/rbac.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { UsersService } from './users.service';

@Controller()
@UseGuards(AuthGuard, RbacGuard)
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  @Get('users')
  @RequireAdmin()
  list(@Query(new ZodValidationPipe(listUsersQuerySchema)) query: ListUsersQuery) {
    return this.users.list(query);
  }

  @Get('users/:id')
  @RequireAdmin()
  get(@Param('id') id: string) {
    return this.users.get(id);
  }

  @Post('users/invite')
  @RequireAdmin()
  invite(
    @CurrentUser() actor: SessionUser,
    @Body(new ZodValidationPipe(inviteUserSchema)) body: InviteUserInput,
    @Req() req: Request,
  ) {
    return this.users.invite(actor, body, clientIp(req));
  }

  @Patch('users/:id/roles')
  @RequireAdmin()
  updateRoles(
    @CurrentUser() actor: SessionUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUserRolesSchema)) body: UpdateUserRolesInput,
    @Req() req: Request,
  ) {
    return this.users.updateRoles(actor, id, body, clientIp(req));
  }

  @Patch('users/:id/status')
  @RequireAdmin()
  updateStatus(
    @CurrentUser() actor: SessionUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUserStatusSchema)) body: UpdateUserStatusInput,
    @Req() req: Request,
  ) {
    return this.users.updateStatus(actor, id, body, clientIp(req));
  }

  @Get('roles')
  @RequireAdmin()
  roles() {
    return this.users.roles();
  }

  @Get('audit-logs')
  @RequireAdmin()
  auditLogs(@Query(new ZodValidationPipe(listAuditLogsQuerySchema)) query: ListAuditLogsQuery) {
    return this.audit.list(query);
  }

  @Get('audit-logs/export')
  @RequireAdmin()
  @Header('Cache-Control', 'no-store')
  async exportAuditLogs(
    @Query(new ZodValidationPipe(exportAuditLogsQuerySchema)) query: ExportAuditLogsQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    const out = await this.audit.export(query);
    const stamp = new Date().toISOString().slice(0, 10);
    if (out.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="terraplan-audit-${stamp}.csv"`);
    } else {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="terraplan-audit-${stamp}.json"`);
    }
    return out.body;
  }
}

function clientIp(req: Request): string | null {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0]!.trim();
  return req.socket.remoteAddress ?? null;
}
