import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { RequestWithMeta } from './request-id.middleware';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<RequestWithMeta>();
    return req.user;
  },
);
