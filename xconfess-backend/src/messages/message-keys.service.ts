import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnonymousUser } from '../user/entities/anonymous-user.entity';
import { User } from '../user/entities/user.entity';
import { AnonymousUserService } from '../user/anonymous-user.service';
import { RegisterMessageKeyDto } from './dto/message-key.dto';

@Injectable()
export class MessageKeysService {
  constructor(
    @InjectRepository(AnonymousUser)
    private readonly anonUserRepo: Repository<AnonymousUser>,
    private readonly anonymousUserService: AnonymousUserService,
  ) {}

  async registerForSession(
    user: User,
    dto: RegisterMessageKeyDto,
  ): Promise<{ anonymousUserId: string; keyVersion: number }> {
    const anon = await this.anonymousUserService.getOrCreateForUserSession(
      user.id,
    );

    const nextVersion =
      anon.messagePublicKey && anon.messagePublicKey !== dto.publicKey
        ? (anon.messageKeyVersion ?? 0) + 1
        : anon.messageKeyVersion ?? 0;

    anon.messagePublicKey = dto.publicKey;
    anon.messageKeyVersion = nextVersion;
    if (dto.encryptedKeyBackup !== undefined) {
      anon.encryptedKeyBackup = dto.encryptedKeyBackup;
    }

    await this.anonUserRepo.save(anon);

    return {
      anonymousUserId: anon.id,
      keyVersion: anon.messageKeyVersion,
    };
  }

  async getMySessionKey(user: User): Promise<{
    anonymousUserId: string;
    publicKey: string | null;
    keyVersion: number;
    hasBackup: boolean;
  }> {
    const anon = await this.anonymousUserService.getOrCreateForUserSession(
      user.id,
    );

    return {
      anonymousUserId: anon.id,
      publicKey: anon.messagePublicKey,
      keyVersion: anon.messageKeyVersion ?? 0,
      hasBackup: Boolean(anon.encryptedKeyBackup),
    };
  }

  async getPublicKey(
    anonymousUserId: string,
  ): Promise<{
    anonymousUserId: string;
    publicKey: string;
    keyVersion: number;
  }> {
    const anon = await this.anonUserRepo.findOne({
      where: { id: anonymousUserId },
    });
    if (!anon) {
      throw new NotFoundException('Anonymous identity not found');
    }

    if (!anon.messagePublicKey) {
      throw new NotFoundException('Participant has not registered an E2E key yet');
    }

    return {
      anonymousUserId: anon.id,
      publicKey: anon.messagePublicKey,
      keyVersion: anon.messageKeyVersion ?? 0,
    };
  }

  async getKeyBackup(user: User): Promise<{
    anonymousUserId: string;
    encryptedKeyBackup: string;
    keyVersion: number;
  }> {
    const anon = await this.anonymousUserService.getOrCreateForUserSession(
      user.id,
    );

    if (!anon.encryptedKeyBackup) {
      throw new NotFoundException('No key backup found for this session');
    }

    return {
      anonymousUserId: anon.id,
      encryptedKeyBackup: anon.encryptedKeyBackup,
      keyVersion: anon.messageKeyVersion ?? 0,
    };
  }
}
