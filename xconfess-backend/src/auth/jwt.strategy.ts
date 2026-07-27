import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../user/user.service';
import { UserRole } from '../user/entities/user.entity';
import { JwtPayload, RequestUser } from './interfaces/jwt-payload.interface';
import { STEP_UP_TOKEN_PURPOSE } from './step-up.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private configService: ConfigService,
    private userService: UserService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(
    payload: JwtPayload & { purpose?: string },
  ): Promise<RequestUser> {
    // Step-up proofs are signed with the same secret but are scoped to a single
    // re-authentication; they must never be accepted as session tokens.
    if (payload.purpose === STEP_UP_TOKEN_PURPOSE) {
      throw new Error('Invalid token');
    }

    // Fetch the user from the database to get latest role and validate existence
    const user = await this.userService.findById(payload.sub);

    if (!user) {
      throw new Error('User not found');
    }

    // Return canonical RequestUser shape
    return {
      id: payload.sub, // Canonical ID field
      sub: payload.sub,
      username: payload.username,
      email: payload.email,
      role: user?.role || UserRole.USER,
      scopes: payload.scopes ?? [],
    };
  }
}
