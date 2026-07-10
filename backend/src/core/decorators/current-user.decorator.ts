import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// Injects the authenticated user (set by JwtStrategy) into a handler param.
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
