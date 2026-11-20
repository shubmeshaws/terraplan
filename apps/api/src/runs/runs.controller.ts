import {
  Body,
  Controller,
  Get,
  HttpCode,
  MessageEvent,
  Param,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import type { CreateRunInput, ListRunsQuery, RunDto, SessionUser } from '@terraplan/shared';
import { createRunSchema, listRunsQuerySchema } from '@terraplan/shared';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RbacGuard, RequirePermission } from '../auth/rbac.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RunLogsService } from './run-logs.service';
import { RunsService } from './runs.service';

@Controller('runs')
@UseGuards(AuthGuard, RbacGuard)
export class RunsController {
  constructor(
    private readonly runs: RunsService,
    private readonly logs: RunLogsService,
  ) {}

  @Get()
  @RequirePermission('runs:view')
  list(@Query(new ZodValidationPipe(listRunsQuerySchema)) query: ListRunsQuery): Promise<RunDto[]> {
    return this.runs.list(query);
  }

  @Sse(':id/logs/stream')
  @RequirePermission('runs:view')
  streamLogs(@Param('id') id: string): Observable<MessageEvent> {
    // JSON-encode payloads so multiline terraform output stays a single SSE data line.
    return this.logs.stream(id).pipe(
      map((msg) => ({
        type: msg.type,
        data: JSON.stringify(msg.data),
        id: msg.id,
      })),
    );
  }

  @Get(':id')
  @RequirePermission('runs:view')
  get(@Param('id') id: string): Promise<RunDto> {
    return this.runs.get(id);
  }

  @Post()
  @RequirePermission('runs:view')
  create(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(createRunSchema)) input: CreateRunInput,
  ): Promise<RunDto> {
    // Action-specific permission (plan/apply/destroy) is enforced in the service.
    return this.runs.create(user, input);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermission('runs:approve')
  approve(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<RunDto> {
    return this.runs.approve(user, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('runs:view')
  cancel(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<RunDto> {
    return this.runs.cancel(user, id);
  }
}
