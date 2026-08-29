import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Logger,
  forwardRef,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';
import * as bcrypt from 'bcryptjs';
import { UpdateUserProfileDto } from './dto/updateProfile.dto';
import {
  PrivacySettingsResponseDto,
  UpdatePrivacySettingsDto,
} from './dto/update-privacy-settings.dto';
import { EmailService } from '../email/email.service';
import { CryptoUtil } from '../common/crypto.util';
import { maskUserId } from '../utils/mask-user-id';
import {
  ActivityType,
  PaginatedUserActivityDto,
} from './dto/user-activity.dto';
import { decryptConfession } from '../utils/confession-encryption';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @Inject(forwardRef(() => EmailService))
    private emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  // =========================
  // BASIC USER METHODS
  // =========================

  private get aesKey(): string {
    return this.configService.get<string>('app.confessionAesKey', '');
  }

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
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await this.findByEmail(normalizedEmail);
    if (existing) {
      throw new AppException(
        'An account with this email already exists.',
        ErrorCode.ALREADY_EXISTS,
        HttpStatus.CONFLICT,
        { field: 'email' },
      );
    }
    const existingUsername = await this.findByUsername(username);
    if (existingUsername) {
      throw new AppException(
        'This username is already taken.',
        ErrorCode.ALREADY_EXISTS,
        HttpStatus.CONFLICT,
        { field: 'username' },
      );
    }

    try {
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
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }
      if ((error as { code?: string })?.code === '23505') {
        throw new AppException(
          'Email or username already in use.',
          ErrorCode.ALREADY_EXISTS,
          HttpStatus.CONFLICT,
        );
      }
      this.logger.error(
        `Failed to create user: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
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
    try {
      await this.userRepository.save(user);
    } catch {
      throw new InternalServerErrorException(
        'Error setting reset password token',
      );
    }
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

    try {
      await this.userRepository.save(user);
    } catch {
      throw new InternalServerErrorException('Error updating password');
    }
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

  async deleteAccount(userId: number): Promise<void> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    await this.userRepository.remove(user);
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
  // TOTP / 2FA helpers
  // =========================

  async setTotpSecret(
    userId: number,
    encrypted: string,
    iv: string,
    tag: string,
  ): Promise<void> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    user.totpSecretEncrypted = encrypted;
    user.totpSecretIv = iv;
    user.totpSecretTag = tag;
    user.totpEnabled = true;

    try {
      await this.userRepository.save(user);
    } catch (e) {
      throw new InternalServerErrorException('Failed to set TOTP secret');
    }
  }

  async disableTotp(userId: number): Promise<void> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    user.totpEnabled = false;
    user.totpSecretEncrypted = null;
    user.totpSecretIv = null;
    user.totpSecretTag = null;
    user.recoveryCodesEncrypted = null;
    user.recoveryCodesIv = null;
    user.recoveryCodesTag = null;

    try {
      await this.userRepository.save(user);
    } catch (e) {
      throw new InternalServerErrorException('Failed to disable TOTP');
    }
  }

  async setRecoveryCodes(userId: number, encrypted: string, iv: string, tag: string): Promise<void> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    user.recoveryCodesEncrypted = encrypted;
    user.recoveryCodesIv = iv;
    user.recoveryCodesTag = tag;
    try {
      await this.userRepository.save(user);
    } catch (e) {
      throw new InternalServerErrorException('Failed to set recovery codes');
    }
  }

  async consumeRecoveryCode(userId: number, code: string): Promise<boolean> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (!user.recoveryCodesEncrypted) return false;

    const { CryptoUtil } = require('../common/crypto.util');
    let codes: string[] = [];
    try {
      const decrypted = CryptoUtil.decrypt(
        user.recoveryCodesEncrypted,
        user.recoveryCodesIv || '',
        user.recoveryCodesTag || '',
      );
      codes = JSON.parse(decrypted) as string[];
    } catch (e) {
      return false;
    }

    const idx = codes.indexOf(code);
    if (idx === -1) return false;

    codes.splice(idx, 1);

    try {
      const enc = CryptoUtil.encrypt(JSON.stringify(codes));
      user.recoveryCodesEncrypted = enc.encrypted;
      user.recoveryCodesIv = enc.iv;
      user.recoveryCodesTag = enc.tag;
      await this.userRepository.save(user);
      return true;
    } catch (e) {
      return false;
    }
  }

  async getProfileSummary(userId: number, page = 1, limit = 10): Promise<any> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 25);
    const offset = (safePage - 1) * safeLimit;

    const anonRows = await this.userRepository.manager.query(
      'SELECT anonymous_user_id as id FROM user_anonymous_users WHERE user_id = $1',
      [userId],
    );
    const anonIds = anonRows.map((row: { id: string }) => row.id);

    const emptyStats = {
      confessions: 0,
      reactions: 0,
      comments: 0,
      tipsSent: 0,
      tipsReceived: 0,
    };

    if (anonIds.length === 0) {
      return {
        profile: {
          id: user.id,
          username: user.username,
          joinDate: user.createdAt,
        },
        stats: emptyStats,
        badges: this.buildReputationBadges(0),
        history: {
          data: [],
          meta: { total: 0, page: safePage, limit: safeLimit, totalPages: 0 },
        },
      };
    }

    const [statsRow] = await this.userRepository.manager.query(
      `
      SELECT
        (SELECT COUNT(*)::int FROM anonymous_confessions c
          WHERE c.anonymous_user_id = ANY($1) AND c."isDeleted" = false) AS confessions,
        (SELECT COUNT(*)::int FROM reaction r
          JOIN anonymous_confessions c ON c.id = r.confession_id
          WHERE c.anonymous_user_id = ANY($1) AND c."isDeleted" = false) AS reactions,
        (SELECT COUNT(*)::int FROM comments com
          JOIN anonymous_confessions c ON c.id = com."confessionId"
          WHERE c.anonymous_user_id = ANY($1) AND com."isDeleted" = false) AS comments,
        (SELECT COALESCE(SUM(t.amount), 0)::float FROM tips t
          JOIN anonymous_confessions c ON c.id = t.confession_id
          WHERE c.anonymous_user_id = ANY($1)) AS tips_received
      `,
      [anonIds],
    );

    const [totalRow] = await this.userRepository.manager.query(
      `
      SELECT COUNT(*)::int AS total
      FROM anonymous_confessions c
      WHERE c.anonymous_user_id = ANY($1)
        AND c."isDeleted" = false
        AND c.is_hidden = false
      `,
      [anonIds],
    );

    const historyRows = await this.userRepository.manager.query(
      `
      SELECT
        c.id,
        c.message,
        c.gender,
        c.view_count,
        c.created_at,
        c.is_anchored,
        c.stellar_tx_hash,
        (SELECT COUNT(*)::int FROM reaction r WHERE r.confession_id = c.id) AS reaction_count,
        (SELECT COUNT(*)::int FROM comments com WHERE com."confessionId" = c.id AND com."isDeleted" = false) AS comment_count
      FROM anonymous_confessions c
      WHERE c.anonymous_user_id = ANY($1)
        AND c."isDeleted" = false
        AND c.is_hidden = false
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT $2 OFFSET $3
      `,
      [anonIds, safeLimit, offset],
    );

    const history = historyRows.map((row: any) => ({
      id: row.id,
      message: decryptConfession(row.message, this.aesKey),
      gender: row.gender,
      viewCount: Number(row.view_count ?? 0),
      reactions: Number(row.reaction_count ?? 0),
      comments: Number(row.comment_count ?? 0),
      createdAt: row.created_at,
      isAnchored: row.is_anchored === true,
      stellarTxHash: row.stellar_tx_hash,
    }));

    const confessions = Number(statsRow?.confessions ?? 0);
    return {
      profile: {
        id: user.id,
        username: user.username,
        joinDate: user.createdAt,
      },
      stats: {
        confessions,
        reactions: Number(statsRow?.reactions ?? 0),
        comments: Number(statsRow?.comments ?? 0),
        tipsSent: 0,
        tipsReceived: Number(statsRow?.tips_received ?? 0),
      },
      badges: this.buildReputationBadges(confessions),
      history: {
        data: history,
        meta: {
          total: Number(totalRow?.total ?? 0),
          page: safePage,
          limit: safeLimit,
          totalPages: Math.ceil(Number(totalRow?.total ?? 0) / safeLimit),
        },
      },
    };
  }

  private buildReputationBadges(confessionCount: number) {
    const contractId = process.env.REPUTATION_BADGES_CONTRACT_ID ?? null;
    const badges = [
      {
        id: 'reputation-contract',
        name: contractId ? 'Reputation linked' : 'Reputation pending',
        description: contractId
          ? `Backed by reputation-badges contract ${contractId}`
          : 'Reputation badge contract is not configured.',
        contractId,
      },
    ];

    if (confessionCount >= 1) {
      badges.push({
        id: 'first-confession',
        name: 'First confession',
        description: 'Published at least one confession.',
        contractId,
      });
    }

    if (confessionCount >= 10) {
      badges.push({
        id: 'steady-voice',
        name: 'Steady voice',
        description: 'Published ten or more confessions.',
        contractId,
      });
    }

    return badges;
  }

  // =========================
  // 🔐 PRIVACY SETTINGS (FIXED)
  // =========================

  async getPrivacySettings(
    userId: number,
  ): Promise<PrivacySettingsResponseDto> {
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
      dataProcessingConsent: ps?.dataProcessingConsent !== false,
    };
  }

  async updatePrivacySettings(
    userId: number,
    dto: UpdatePrivacySettingsDto,
  ): Promise<PrivacySettingsResponseDto> {
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

    return {
      isDiscoverable: user.isDiscoverable(),
      canReceiveReplies: user.canReceiveReplies(),
      showReactions: user.shouldShowReactions(),
      dataProcessingConsent:
        user.privacySettings?.dataProcessingConsent !== false,
    };
  }

  private async enforcePrivacyPolicies(user: User): Promise<void> {
    if (!user.canReceiveReplies()) {
      this.logger.debug(`Replies disabled for user ${user.id}`);
    }

    if (!user.shouldShowReactions()) {
      this.logger.debug(`Reactions hidden for user ${user.id}`);
    }
  }

  async getUserConfessionsList(
    userId: number,
    page: number,
    limit: number,
  ): Promise<{ data: any[]; meta: any }> {
    const user = await this.findById(userId);
    if (!user) {
      return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
    }

    const userEntity = this.userRepository.metadata.target;
    const skip = (page - 1) * limit;

    const confessions = await this.userRepository.manager
      .createQueryBuilder(userEntity as any, 'u')
      .leftJoinAndSelect('u.anonymousUser', 'au')
      .leftJoinAndSelect('au.confessions', 'confessions')
      .where('u.id = :userId', { userId })
      .andWhere('confessions.isDeleted = false')
      .andWhere('confessions.isHidden = false')
      .orderBy('confessions.created_at', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const [data, total] = confessions;

    const decryptedData = data
      .flatMap((u: any) => u.anonymousUser?.confessions || [])
      .map((confession: any) => {
        if (confession.message) {
          try {
            const { CryptoUtil } = require('../common/crypto.util');
            confession.message = CryptoUtil.decrypt(
              confession.message,
              confession.messageIv,
              confession.messageTag,
            );
          } catch {
            confession.message = '[Encrypted]';
          }
        }
        return confession;
      });

    return {
      data: decryptedData,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getUserActivitiesList(
    userId: number,
    page: number,
    limit: number,
  ): Promise<PaginatedUserActivityDto> {
    const user = await this.findById(userId);
    if (!user) {
      return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
    }

    const offset = (page - 1) * limit;

    try {
      // Use raw SQL for efficient multi-table aggregation via UNION ALL
      const rawData = await this.userRepository.manager.query(
        `
      SELECT * FROM (
        -- Confessions
        SELECT 
          c.id::text as id, 
          '${ActivityType.CONFESSION}' as type, 
          c.message as content, 
          json_build_object('isAnchored', c.is_anchored, 'stellarTxHash', c.stellar_tx_hash) as metadata, 
          c.created_at as "createdAt"
        FROM anonymous_confessions c
        JOIN user_anonymous_users ul ON c.anonymous_user_id = ul.anonymous_user_id
        WHERE ul.user_id = $1 AND c."isDeleted" = false AND c.is_hidden = false

        UNION ALL

        -- Comments
        SELECT 
          com.id::text as id, 
          '${ActivityType.COMMENT}' as type, 
          com.content as content, 
          json_build_object('confessionId', com."confessionId") as metadata, 
          com."createdAt" as "createdAt"
        FROM comments com
        JOIN user_anonymous_users ul ON com.anonymous_user_id = ul.anonymous_user_id
        WHERE ul.user_id = $1 AND com."isDeleted" = false

        UNION ALL

        -- Reactions
        SELECT 
          r.id::text as id, 
          '${ActivityType.REACTION}' as type, 
          NULL as content, 
          json_build_object('emoji', r.emoji, 'confessionId', r.confession_id) as metadata, 
          r.created_at as "createdAt"
        FROM reaction r
        JOIN user_anonymous_users ul ON r.anonymous_user_id = ul.anonymous_user_id
        WHERE ul.user_id = $1

        UNION ALL

        -- Reports
        SELECT 
          rep.id::text as id, 
          '${ActivityType.REPORT}' as type, 
          rep.details as content, 
          json_build_object('reason', rep.reason, 'status', rep.status, 'confessionId', rep."confessionId") as metadata, 
          rep.created_at as "createdAt"
        FROM reports rep
        WHERE rep."reporterId" = $1
      ) activity
        ORDER BY "createdAt" DESC
        LIMIT $2 OFFSET $3
        `,
        [userId, limit, offset],
      );

      const countResult = await this.userRepository.manager.query(
        `
        SELECT COUNT(*) as total FROM (
          SELECT 1 FROM anonymous_confessions c JOIN user_anonymous_users ul ON c.anonymous_user_id = ul.anonymous_user_id WHERE ul.user_id = $1 AND c."isDeleted" = false AND c.is_hidden = false
          UNION ALL
          SELECT 1 FROM comments com JOIN user_anonymous_users ul ON com.anonymous_user_id = ul.anonymous_user_id WHERE ul.user_id = $1 AND com."isDeleted" = false
          UNION ALL
          SELECT 1 FROM reaction r JOIN user_anonymous_users ul ON r.anonymous_user_id = ul.anonymous_user_id WHERE ul.user_id = $1
          UNION ALL
          SELECT 1 FROM reports rep WHERE rep."reporterId" = $1
        ) activity
        `,
        [userId],
      );

      const total = parseInt(countResult[0].total, 10);

      const activities = rawData.map((activity: any) => {
        let content = activity.content;

        // Decrypt confessions if owner
        if (activity.type === ActivityType.CONFESSION && content) {
          try {
            content = decryptConfession(content, this.aesKey);
          } catch (e) {
            content = '[Encrypted Content]';
          }
        }

        return {
          id: activity.id,
          type: activity.type as ActivityType,
          content: content,
          metadata: activity.metadata,
          createdAt: activity.createdAt,
        };
      });

      return {
        data: activities,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      this.logger.error(`Failed to aggregate user activity: ${error.message}`, error.stack);
      return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
    }
  }

  async updateSettings(
    userId: number,
    dto: Record<string, any>,
  ): Promise<User> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    if (dto.privacySettings) {
      user.privacySettings = {
        ...user.privacySettings,
        ...dto.privacySettings,
      };
    }

    if (dto.notificationPreferences) {
      user.notificationPreferences = {
        ...user.notificationPreferences,
        ...dto.notificationPreferences,
      };
    }

    for (const key of Object.keys(dto)) {
      if (
        key !== 'privacySettings' &&
        key !== 'notificationPreferences' &&
        key in user
      ) {
        (user as any)[key] = dto[key];
      }
    }

    await this.userRepository.save(user);
    await this.enforcePrivacyPolicies(user);
    return user;
  }

  async getPublicProfile(userId: string | number): Promise<any> {
    const numericId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(numericId)) {
      throw new NotFoundException('User not found');
    }
    const user = await this.findById(numericId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const anonRows = await this.userRepository.manager.query(
      'SELECT anonymous_user_id as id FROM user_anonymous_users WHERE user_id = $1',
      [numericId],
    );
    const anonIds = anonRows.map((row: { id: string }) => row.id);

    let stats = {
      confessions: 0,
      reactions: 0,
      comments: 0,
      tipsReceived: 0,
    };

    if (anonIds.length > 0) {
      const [statsRow] = await this.userRepository.manager.query(
        `
        SELECT
          (SELECT COUNT(*)::int FROM anonymous_confessions c
            WHERE c.anonymous_user_id = ANY($1) AND c."isDeleted" = false) AS confessions,
          (SELECT COUNT(*)::int FROM reaction r
            JOIN anonymous_confessions c ON c.id = r.confession_id
            WHERE c.anonymous_user_id = ANY($1) AND c."isDeleted" = false) AS reactions,
          (SELECT COUNT(*)::int FROM comments com
            JOIN anonymous_confessions c ON c.id = com."confessionId"
            WHERE c.anonymous_user_id = ANY($1) AND com."isDeleted" = false) AS comments,
          (SELECT COALESCE(SUM(t.amount), 0)::float FROM tips t
            JOIN anonymous_confessions c ON c.id = t.confession_id
            WHERE c.anonymous_user_id = ANY($1)) AS tips_received
        `,
        [anonIds],
      );
      stats = {
        confessions: Number(statsRow?.confessions ?? 0),
        reactions: Number(statsRow?.reactions ?? 0),
        comments: Number(statsRow?.comments ?? 0),
        tipsReceived: Number(statsRow?.tips_received ?? 0),
      };
    }

    const badges = this.buildReputationBadges(stats.confessions);

    return {
      displayName: user.username,
      username: user.username,
      avatar: null,
      createdAt: user.createdAt,
      stats,
      badges,
    };
  }
}
