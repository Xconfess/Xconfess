import { Body, Controller, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RegisterDto } from '../auth/dto/register.dto';
import { CryptoUtil } from '../common/crypto.util';
import { UserResponse } from './dto/user-response.dto';
import { User } from './entities/user.entity';
import { UserService } from './user.service';

@ApiTags('Users')
@Controller('users')
export class UserPublicController {
  constructor(private readonly userService: UserService) {}

  @Post('register')
  @ApiOperation({ summary: 'Create a new xConfess account' })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({
    status: 201,
    description: 'Account created.',
  })
  async register(@Body() dto: RegisterDto): Promise<{ user: UserResponse }> {
    const user = await this.userService.create(
      dto.email,
      dto.password,
      dto.username,
    );

    return { user: this.toUserResponse(user) };
  }

  private toUserResponse(user: User): UserResponse {
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      is_active: user.is_active,
      email: CryptoUtil.decrypt(user.emailEncrypted, user.emailIv, user.emailTag),
      notificationPreferences: user.notificationPreferences || {},
      privacy: {
        isDiscoverable: user.isDiscoverable(),
        canReceiveReplies: user.canReceiveReplies(),
        showReactions: user.shouldShowReactions(),
        dataProcessingConsent: user.hasDataProcessingConsent(),
      },
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
