import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { SessionUser } from '@terraplan/shared';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionUser => {
    const req = ctx.switchToHttp().getRequest<{ user: SessionUser }>();
    return req.user;
  },
);
