import { Controller, Get, UseGuards } from '@nestjs/common';
import type { EnvironmentLockDto } from '@terraplan/shared';
import { AuthGuard } from '../auth/auth.guard';
import { RbacGuard, RequirePermission } from '../auth/rbac.guard';
import { LocksService } from './locks.service';

@Controller('locks')
@UseGuards(AuthGuard, RbacGuard)
export class LocksController {
  constructor(private readonly locks: LocksService) {}

  @Get()
  @RequirePermission('runs:view')
  list(): Promise<EnvironmentLockDto[]> {
    return this.locks.list();
  }
}
