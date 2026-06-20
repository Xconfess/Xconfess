import 'reflect-metadata';

import { createHash } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import dataSource from '../data-source';
import { Comment } from '../src/comment/entities/comment.entity';
import { CryptoUtil } from '../src/common/crypto.util';
import { AnonymousConfession } from '../src/confession/entities/confession.entity';
import { Gender } from '../src/confession/dto/get-confessions.dto';
import { Reaction } from '../src/reaction/entities/reaction.entity';
import { Tip, TipVerificationStatus } from '../src/tipping/entities/tip.entity';
import { AnonymousUser } from '../src/user/entities/anonymous-user.entity';
import { UserAnonymousUser } from '../src/user/entities/user-anonymous-link.entity';
import { User, UserRole } from '../src/user/entities/user.entity';
import { encryptConfession } from '../src/utils/confession-encryption';

const DEMO_PASSWORD = 'Wave5DemoPass!2026';
const LOCAL_CONFESSION_AES_KEY = 'local-demo-confession-aes-key-32';
const BUCKETS = [
  'users',
  'anonymousUsers',
  'confessions',
  'reactions',
  'comments',
  'tips',
] as const;

type Bucket = (typeof BUCKETS)[number];
type Action = 'created' | 'updated' | 'skipped';
type SeedReport = Record<Bucket, Record<Action, number>>;

const USERS = [
  {
    key: 'regular',
    username: 'wave5_user',
    email: 'wave5-user@example.test',
    role: UserRole.USER,
  },
  {
    key: 'friend',
    username: 'wave5_friend',
    email: 'wave5-friend@example.test',
    role: UserRole.USER,
  },
  {
    key: 'admin',
    username: 'wave5_admin',
    email: 'wave5-admin@example.test',
    role: UserRole.ADMIN,
  },
] as const;

const CONFESSIONS = [
  {
    key: 'launch-checkin',
    ownerKey: 'regular',
    message: 'Wave 5 demo: shipping a calmer launch after a long week.',
    gender: Gender.OTHER,
  },
  {
    key: 'team-support',
    ownerKey: 'friend',
    message: 'Wave 5 demo: a teammate helped turn a rough day around.',
    gender: Gender.FEMALE,
  },
  {
    key: 'tip-readiness',
    ownerKey: 'regular',
    message: 'Wave 5 demo: validating anonymous tips before the walkthrough.',
    gender: Gender.MALE,
  },
] as const;

const REACTIONS = [
  { actorKey: 'friend', confessionKey: 'launch-checkin', emoji: 'like' },
  { actorKey: 'admin', confessionKey: 'launch-checkin', emoji: 'heart' },
  { actorKey: 'regular', confessionKey: 'team-support', emoji: 'support' },
] as const;

const COMMENTS = [
  {
    key: 'launch-support',
    actorKey: 'friend',
    confessionKey: 'launch-checkin',
    content: 'Rooting for this launch. The checklist looks solid.',
  },
  {
    key: 'team-thanks',
    actorKey: 'regular',
    confessionKey: 'team-support',
    content: 'This is exactly the kind of support worth calling out.',
  },
  {
    key: 'launch-admin-reply',
    actorKey: 'admin',
    confessionKey: 'launch-checkin',
    content: 'Admin demo reply for nested comment moderation checks.',
    parentKey: 'launch-support',
  },
] as const;

const TIPS = [
  {
    key: 'tip-1',
    confessionKey: 'launch-checkin',
    amount: 1.25,
    status: TipVerificationStatus.VERIFIED,
  },
  {
    key: 'tip-2',
    confessionKey: 'tip-readiness',
    amount: 2.5,
    status: TipVerificationStatus.PENDING,
  },
] as const;

function stableHex(seed: string): string {
  return createHash('sha256').update(seed).digest('hex');
}

function stableUuid(seed: string): string {
  const hex = stableHex(seed);
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    '4' + hex.slice(13, 16),
    variant + hex.slice(17, 20),
    hex.slice(20, 32),
  ].join('-');
}

function createReport(): SeedReport {
  return Object.fromEntries(
    BUCKETS.map((bucket) => [bucket, { created: 0, updated: 0, skipped: 0 }]),
  ) as SeedReport;
}

function mark(report: SeedReport, bucket: Bucket, action: Action): void {
  report[bucket][action] += 1;
}

function getConfessionAesKey(): string {
  const key = process.env.CONFESSION_AES_KEY || LOCAL_CONFESSION_AES_KEY;
  if (key.length !== 32) {
    throw new Error('CONFESSION_AES_KEY must be exactly 32 characters.');
  }
  return key;
}

async function seedUsers(
  source: DataSource,
  report: SeedReport,
): Promise<Map<string, User>> {
  const userRepo = source.getRepository(User);
  const users = new Map<string, User>();

  for (const seed of USERS) {
    const email = seed.email.toLowerCase();
    const emailHash = CryptoUtil.hash(email);
    const usernameOwner = await userRepo.findOne({
      where: { username: seed.username },
    });

    if (usernameOwner && usernameOwner.emailHash !== emailHash) {
      throw new Error('Demo username already belongs to another local account: ' + seed.username);
    }

    const encryptedEmail = CryptoUtil.encrypt(email);
    const existing = await userRepo.findOne({ where: { emailHash } });
    const user = existing ?? userRepo.create();
    user.username = seed.username;
    user.password = await bcrypt.hash(DEMO_PASSWORD, 10);
    user.emailEncrypted = encryptedEmail.encrypted;
    user.emailIv = encryptedEmail.iv;
    user.emailTag = encryptedEmail.tag;
    user.emailHash = emailHash;
    user.role = seed.role;
    user.is_active = true;
    user.notificationPreferences = {};
    user.privacySettings = {
      isDiscoverable: true,
      canReceiveReplies: true,
      showReactions: true,
      dataProcessingConsent: true,
    };

    users.set(seed.key, await userRepo.save(user));
    mark(report, 'users', existing ? 'updated' : 'created');
  }

  return users;
}

async function seedAnonymousUsers(
  source: DataSource,
  users: Map<string, User>,
  report: SeedReport,
): Promise<Map<string, AnonymousUser>> {
  const anonymousRepo = source.getRepository(AnonymousUser);
  const linkRepo = source.getRepository(UserAnonymousUser);
  const anonymousUsers = new Map<string, AnonymousUser>();

  for (const seed of USERS) {
    const id = stableUuid('wave5-anonymous-user:' + seed.key);
    const existing = await anonymousRepo.findOne({ where: { id } });
    const anonymousUser = existing ?? anonymousRepo.create({ id });
    const savedAnonymousUser = await anonymousRepo.save(anonymousUser);
    const user = users.get(seed.key);

    if (!user) throw new Error('Missing seeded user for ' + seed.key);

    const existingLink = await linkRepo.findOne({
      where: { userId: user.id, anonymousUserId: savedAnonymousUser.id },
    });

    if (!existingLink) {
      await linkRepo.save(
        linkRepo.create({
          id: stableUuid('wave5-user-link:' + seed.key),
          userId: user.id,
          anonymousUserId: savedAnonymousUser.id,
        }),
      );
    }

    anonymousUsers.set(seed.key, savedAnonymousUser);
    mark(report, 'anonymousUsers', existing ? 'skipped' : 'created');
  }

  return anonymousUsers;
}

async function seedConfessions(
  source: DataSource,
  anonymousUsers: Map<string, AnonymousUser>,
  report: SeedReport,
): Promise<Map<string, AnonymousConfession>> {
  const confessionRepo = source.getRepository(AnonymousConfession);
  const confessions = new Map<string, AnonymousConfession>();
  const aesKey = getConfessionAesKey();

  for (const seed of CONFESSIONS) {
    const anonymousUser = anonymousUsers.get(seed.ownerKey);
    if (!anonymousUser) throw new Error('Missing anonymous user for ' + seed.ownerKey);

    const idempotencyKey = 'wave5-demo-confession-' + seed.key;
    const existing = await confessionRepo.findOne({ where: { idempotencyKey } });
    const confession =
      existing ??
      confessionRepo.create({
        id: stableUuid('wave5-confession:' + seed.key),
        idempotencyKey,
      });

    confession.message = encryptConfession(seed.message, aesKey);
    confession.gender = seed.gender;
    confession.anonymousUser = anonymousUser;
    confession.anonymousUserId = anonymousUser.id;
    confession.view_count = 0;
    confession.isDeleted = false;
    confession.deletedAt = null;
    confession.deletedBy = null;
    confession.moderationScore = 0;
    confession.moderationFlags = [];
    confession.moderationStatus = 'approved';
    confession.requiresReview = false;
    confession.isHidden = false;
    confession.moderationDetails = {};

    confessions.set(seed.key, await confessionRepo.save(confession));
    mark(report, 'confessions', existing ? 'updated' : 'created');
  }

  return confessions;
}

async function seedReactions(
  source: DataSource,
  anonymousUsers: Map<string, AnonymousUser>,
  confessions: Map<string, AnonymousConfession>,
  report: SeedReport,
): Promise<void> {
  const reactionRepo = source.getRepository(Reaction);

  for (const seed of REACTIONS) {
    const id = stableUuid(
      'wave5-reaction:' + seed.actorKey + ':' + seed.confessionKey + ':' + seed.emoji,
    );
    const existing = await reactionRepo.findOne({ where: { id } });

    if (existing) {
      mark(report, 'reactions', 'skipped');
      continue;
    }

    const anonymousUser = anonymousUsers.get(seed.actorKey);
    const confession = confessions.get(seed.confessionKey);
    if (!anonymousUser || !confession) throw new Error('Missing reaction relation for ' + id);

    await reactionRepo.save(
      reactionRepo.create({ id, emoji: seed.emoji, anonymousUser, confession }),
    );
    mark(report, 'reactions', 'created');
  }
}

async function seedComments(
  source: DataSource,
  anonymousUsers: Map<string, AnonymousUser>,
  confessions: Map<string, AnonymousConfession>,
  report: SeedReport,
): Promise<void> {
  const commentRepo = source.getRepository(Comment);
  const comments = new Map<string, Comment>();

  for (const seed of COMMENTS) {
    const anonymousUser = anonymousUsers.get(seed.actorKey);
    const confession = confessions.get(seed.confessionKey);
    const parent = 'parentKey' in seed && seed.parentKey ? comments.get(seed.parentKey) : undefined;
    if (!anonymousUser || !confession) throw new Error('Missing comment relation for ' + seed.key);
    if ('parentKey' in seed && seed.parentKey && !parent) throw new Error('Missing parent comment for ' + seed.key);

    let query = commentRepo
      .createQueryBuilder('comment')
      .leftJoin('comment.confession', 'confession')
      .leftJoin('comment.anonymousUser', 'anonymousUser')
      .where('comment.content = :content', { content: seed.content })
      .andWhere('confession.id = :confessionId', { confessionId: confession.id })
      .andWhere('anonymousUser.id = :anonymousUserId', {
        anonymousUserId: anonymousUser.id,
      });

    query = parent
      ? query.andWhere('comment.parent_id = :parentId', { parentId: parent.id })
      : query.andWhere('comment.parent_id IS NULL');

    const existing = await query.getOne();
    if (existing) {
      comments.set(seed.key, existing);
      mark(report, 'comments', 'skipped');
      continue;
    }

    const comment = commentRepo.create({
      content: seed.content,
      anonymousUser,
      confession,
      anonymousContextId: anonymousUser.id,
      parent,
      isDeleted: false,
    });

    comments.set(seed.key, await commentRepo.save(comment));
    mark(report, 'comments', 'created');
  }
}

async function seedTips(
  source: DataSource,
  confessions: Map<string, AnonymousConfession>,
  report: SeedReport,
): Promise<void> {
  const tipRepo = source.getRepository(Tip);

  for (const seed of TIPS) {
    const confession = confessions.get(seed.confessionKey);
    if (!confession) throw new Error('Missing confession for tip ' + seed.key);

    const txId = stableHex('wave5-demo-tip:' + seed.key);
    const existing = await tipRepo.findOne({ where: { txId } });
    const tip = existing ?? tipRepo.create({ id: stableUuid('wave5-tip:' + seed.key) });

    tip.confession = confession;
    tip.confessionId = confession.id;
    tip.amount = seed.amount;
    tip.txId = txId;
    tip.idempotencyKey = 'wave5-demo-tip-' + seed.key;
    tip.senderAddress = null;
    tip.verificationStatus = seed.status;
    tip.verifiedAt = seed.status === TipVerificationStatus.VERIFIED ? new Date() : null;
    tip.rejectionReason = null;
    tip.retryCount = 0;
    tip.lastChainStatus = seed.status;
    tip.lastCheckedAt = tip.verifiedAt;
    tip.reconciliationMetadata = { source: 'local-demo-seed' };

    await tipRepo.save(tip);
    mark(report, 'tips', existing ? 'updated' : 'created');
  }
}

export async function seedDemoRecords(source: DataSource): Promise<SeedReport> {
  const report = createReport();
  const users = await seedUsers(source, report);
  const anonymousUsers = await seedAnonymousUsers(source, users, report);
  const confessions = await seedConfessions(source, anonymousUsers, report);

  await seedReactions(source, anonymousUsers, confessions, report);
  await seedComments(source, anonymousUsers, confessions, report);
  await seedTips(source, confessions, report);

  return report;
}

function printReport(report: SeedReport): void {
  console.log('Seeded Wave 5 local demo data.');
  for (const bucket of BUCKETS) {
    const value = report[bucket];
    console.log(
      '- ' +
        bucket +
        ': created ' +
        value.created +
        ', updated ' +
        value.updated +
        ', skipped ' +
        value.skipped,
    );
  }
  console.log('');
  console.log('Demo credentials:');
  console.log('- wave5_user / ' + DEMO_PASSWORD);
  console.log('- wave5_friend / ' + DEMO_PASSWORD);
  console.log('- wave5_admin / ' + DEMO_PASSWORD);
}

async function main(): Promise<void> {
  try {
    await dataSource.initialize();
    printReport(await seedDemoRecords(dataSource));
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Failed to seed Wave 5 demo data: ' + message);
    process.exitCode = 1;
  });
}
