import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestUser } from './interfaces/jwt-payload.interface';

export const GetUser = createParamDecorator(
  (data: keyof RequestUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as RequestUser;

    // If no specific property requested, return the entire user object
    if (!data) {
      return user;
    }

    // Return the specific property (e.g., 'id', 'username', 'email', 'role')
    return user?.[data];
  },
);
