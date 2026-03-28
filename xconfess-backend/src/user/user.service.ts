import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole, PrivacySettings } from './entities/user.entity';
import * as bcrypt from 'bcryptjs';
import { UpdateUserProfileDto } from './dto/updateProfile.dto';
import { UpdatePrivacySettingsDto } from './dto/update-privacy-settings.dto';
import { EmailService } from '../email/email.service';
import { CryptoUtil } from '../common/crypto.util';
import { maskUserId } from '../utils/mask-user-id';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @Inject(forwardRef(() => EmailService))
    private emailService: EmailService,
  ) {}

  // =========================
  // BASIC USER METHODS
  // =========================

  async findByEmail(email: string): Promise<User | null> {
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const emailHash = CryptoUtil.hash(normalizedEmail);
      return await this.userRepository.findOne({ where: { emailHash } });
    } catch {
      throw new InternalServerErrorException('Error finding user by email');
    }
  }

  async findByUsername(username: string): Promise<User | null> {
    try {
      return await this.userRepository.findOne({
        where: { username: username.trim() },
      });
    } catch {
      throw new InternalServerErrorException('Error finding user by username');
    }
  }

  async findById(id: number): Promise<User | null> {
    try {
      return await this.userRepository.findOne({ where: { id } });
    } catch {
      throw new InternalServerErrorException('Error finding user by ID');
    }
  }

  // =========================
  // CREATE USER
  // =========================

  async create(
    email: string,
    password: string,
    username: string,
  ): Promise<User> {
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const hashedPassword = await bcrypt.hash(password, 10);

      const { encrypted, iv, tag } = CryptoUtil.encrypt(normalizedEmail);
      const emailHash = CryptoUtil.hash(normalizedEmail);

      const user = this.userRepository.create({
        emailEncrypted: encrypted,
        emailIv: iv,
        emailTag: tag,
        emailHash,
        password: hashedPassword,
        username,
      });

      const savedUser = await this.userRepository.save(user);

      try {
        await this.emailService.sendWelcomeEmail(
          normalizedEmail,
          savedUser.username,
        );
      } catch (err) {
        // Ignore email sending failures as they shouldn't block user creation
        this.logger.warn(
          `Failed to send welcome email to ${normalizedEmail}: ${
            err instanceof Error ? err.message : err
          }`,
        );
      }
      return savedUser;
    } catch {
      throw new InternalServerErrorException('Failed to create user');
    }
  }

  // =========================
  // PROFILE
  // =========================

  async updateProfile(
    userId: number,
    updateDto: UpdateUserProfileDto,
  ): Promise<User> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    Object.assign(user, updateDto);
    return this.userRepository.save(user);
  }

  // =========================
  // Password reset helpers
  // =========================

  /**
   * Persist legacy reset fields on the user row.
   * (Some flows still use these columns in addition to the password_resets table.)
   */
  async setResetPasswordToken(
    userId: number,
    token: string,
    expiresAt: Date,
  ): Promise<void> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    user.resetPasswordToken = token;
    user.resetPasswordExpires = expiresAt;
    await this.userRepository.save(user);
  }

  /**
   * Update the user's password and clear any reset token fields.
   */
  async updatePassword(userId: number, newPassword: string): Promise<void> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await this.userRepository.save(user);
  }

  // =========================
  // ACCOUNT STATUS
  // =========================

  async deactivateAccount(userId: number): Promise<User> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    user.is_active = false;
    return this.userRepository.save(user);
  }

  async reactivateAccount(userId: number): Promise<User> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    user.is_active = true;
    return this.userRepository.save(user);
  }

  // =========================
  // ROLE
  // =========================

  async setUserRole(userId: number, role: UserRole): Promise<User> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    user.role = role;
    return this.userRepository.save(user);
  }

  // =========================
  // SAVE USER
  // =========================

  async saveUser(user: User): Promise<User> {
    return this.userRepository.save(user);
  }

  // =========================
  // 🔐 PRIVACY SETTINGS (FIXED)
  // =========================

  async getPrivacySettings(userId: number): Promise<PrivacySettings> {
    const user = await this.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const ps = user.privacySettings;
    const dataProcessingConsent =
      ps?.dataProcessingConsent === undefined ? true : ps.dataProcessingConsent;

    return {
      isDiscoverable: user.isDiscoverable(),
      canReceiveReplies: user.canReceiveReplies(),
      showReactions: user.shouldShowReactions(),
      dataProcessingConsent,
    };
  }

  async updatePrivacySettings(
    userId: number,
    dto: UpdatePrivacySettingsDto,
  ): Promise<PrivacySettings> {
    const user = await this.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const current = user.privacySettings || {
      isDiscoverable: true,
      canReceiveReplies: true,
      showReactions: true,
      dataProcessingConsent: true,
    };

    user.privacySettings = {
      isDiscoverable: dto.isDiscoverable ?? current.isDiscoverable,
      canReceiveReplies: dto.canReceiveReplies ?? current.canReceiveReplies,
      showReactions: dto.showReactions ?? current.showReactions,
      dataProcessingConsent:
        dto.dataProcessingConsent ?? current.dataProcessingConsent ?? true,
    };

    await this.userRepository.save(user);

    await this.enforcePrivacyPolicies(user);

    return user.privacySettings;
  }

  private async enforcePrivacyPolicies(user: User): Promise<void> {
    if (!user.canReceiveReplies()) {
      this.logger.debug(`Replies disabled for user ${user.id}`);
    }

    if (!user.shouldShowReactions()) {
      this.logger.debug(`Reactions hidden for user ${user.id}`);
    }
  }
}
