#!/usr/bin/env ts-node
/**
 * Seed script for Wave 5 local demo data.
 *
 * Creates demo users (admin + regular), anonymous users, confessions,
 * reactions, comments, tags, and sample tips.
 *
 * Safe to re-run: uses upsert semantics for users and tags,
 * skips existing confessions by message hash.
 *
 * Usage:
 *   cd xconfess-backend
 *   npx ts-node scripts/seed-demo.ts
 *
 * Environment:
 *   Requires .env with DB_* variables (same as app).
 *   Exits non-zero on DB connection failure.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as crypto from 'crypto';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { DataSource } from 'typeorm';
import { User, UserRole } from '../src/user/entities/user.entity';
import { AnonymousUser } from '../src/user/entities/anonymous-user.entity';
import { UserAnonymousUser } from '../src/user/entities/user-anonymous-link.entity';
import { AnonymousConfession } from '../src/confession/entities/confession.entity';
import { Comment } from '../src/comment/entities/comment.entity';
import { Reaction } from '../src/reaction/entities/reaction.entity';
import { Tag } from '../src/confession/entities/tag.entity';
import { ConfessionTag } from '../src/confession/entities/confession-tag.entity';
import { Tip, TipVerificationStatus } from '../src/tipping/entities/tip.entity';
import { Gender } from '../src/confession/dto/get-confessions.dto';
import { CryptoUtil } from '../src/common/crypto.util';

// ─── Demo credentials (documented, no secrets) ───────────────────────────────
const DEMO_ADMIN = {
  username: 'demo-admin',
  email: 'admin@demo.local',
  password: 'DemoAdmin123!',
};

const DEMO_USER = {
  username: 'demo-user',
  email: 'user@demo.local',
  password: 'DemoUser123!',
};

// ─── Demo data ────────────────────────────────────────────────────────────────
const DEMO_TAGS = [
  { name: 'advice', description: 'Seeking or offering advice' },
  { name: 'confession', description: 'Personal confessions' },
  { name: 'question', description: 'Questions to the community' },
  { name: 'story', description: 'Personal stories and experiences' },
  { name: 'support', description: 'Support and encouragement' },
];

const DEMO_CONFESSIONS = [
  {
    message: "I've been struggling with imposter syndrome at work for months. Everyone seems so confident and I feel like I don't belong. Does anyone else feel this way?",
    gender: Gender.OTHER,
    tags: ['advice', 'support'],
    reactions: [
      { emoji: '❤️', count: 3 },
      { emoji: '🤗', count: 2 },
    ],
    comments: [
      "You're not alone — I felt the same way for years. It gets better!",
      "Imposter syndrome is so common. You're doing better than you think.",
    ],
  },
  {
    message: "I finally told my family about my mental health struggles today. They were so supportive and I wish I had done it years ago. Don't wait like I did.",
    gender: Gender.FEMALE,
    tags: ['confession', 'story', 'support'],
    reactions: [
      { emoji: '❤️', count: 5 },
      { emoji: '🙏', count: 3 },
      { emoji: '💪', count: 2 },
    ],
    comments: [
      "This is so brave. Thank you for sharing.",
      "Your story gives me courage to open up too.",
    ],
  },
  {
    message: "What's the best way to start investing with a small amount? I'm 22 and just got my first job. I want to be smart about money.",
    gender: Gender.MALE,
    tags: ['question', 'advice'],
    reactions: [
      { emoji: '👍', count: 4 },
      { emoji: '💡', count: 2 },
    ],
    comments: [
      "Start with an emergency fund, then look into index funds!",
      "The fact that you're thinking about this at 22 puts you ahead of most people.",
    ],
  },
  {
    message: "I ghosted my best friend 3 years ago over something stupid and I've regretted it every day. I don't know how to reach out after all this time.",
    gender: Gender.OTHER,
    tags: ['confession', 'advice'],
    reactions: [
      { emoji: '❤️', count: 2 },
      { emoji: '😢', count: 1 },
    ],
    comments: [
      "It's never too late. Send that message — I bet they've been thinking about you too.",
      "I did this last year and we're closer now than before. Just reach out.",
    ],
  },
  {
    message: "After 5 years of grinding, I finally launched my side project today. It's not perfect but it's mine. Here's to the journey!",
    gender: Gender.MALE,
    tags: ['story', 'support'],
    reactions: [
      { emoji: '🎉', count: 6 },
      { emoji: '🚀', count: 4 },
      { emoji: '💪', count: 3 },
    ],
    comments: [
      "Congratulations! The hardest part is starting.",
      "This is so inspiring. What did you build?",
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hashEmail(email: string): string {
  return crypto.createHash('sha256').update(email.toLowerCase()).digest('hex');
}

function encryptEmail(email: string) {
  return CryptoUtil.encrypt(email);
}

async function upsertUser(
  userRepo: any,
  username: string,
  email: string,
  password: string,
  role: UserRole = UserRole.USER,
): Promise<User> {
  let user = await userRepo.findOne({ where: { username } });
  if (user) {
    console.log(`  User "${username}" already exists (id=${user.id}), skipping.`);
    return user;
  }

  const emailEncrypted = encryptEmail(email);
  const emailHash = hashEmail(email);

  // Hash password with bcrypt-like approach (simplified for seed)
  const bcrypt = require('bcryptjs');
  const hashedPassword = await bcrypt.hash(password, 10);

  user = userRepo.create({
    username,
    password: hashedPassword,
    emailEncrypted: emailEncrypted.encrypted,
    emailIv: emailEncrypted.iv,
    emailTag: emailEncrypted.tag,
    emailHash,
    role,
    is_active: true,
    notificationPreferences: {},
    privacySettings: {
      isDiscoverable: true,
      canReceiveReplies: true,
      showReactions: true,
      dataProcessingConsent: true,
    },
  });

  user = await userRepo.save(user);
  console.log(`  Created user "${username}" (id=${user.id}, role=${role})`);
  return user;
}

async function upsertTag(tagRepo: any, name: string, description: string): Promise<Tag> {
  let tag = await tagRepo.findOne({ where: { name } });
  if (tag) {
    return tag;
  }
  tag = tagRepo.create({ name, description });
  tag = await tagRepo.save(tag);
  console.log(`  Created tag "${name}"`);
  return tag;
}

// ─── Main seed function ───────────────────────────────────────────────────────

async function seed() {
  console.log('🌱 Starting Wave 5 demo seed...\n');

  // Validate env
  const required = ['DB_HOST', 'DB_PORT', 'DB_USERNAME', 'DB_PASSWORD', 'DB_NAME'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`❌ Missing required env vars: ${missing.join(', ')}`);
    process.exit(1);
  }

  // Build DataSource
  const port = parseInt(process.env.DB_PORT!, 10);
  if (isNaN(port)) {
    console.error('❌ DB_PORT must be a valid number');
    process.exit(1);
  }

  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    entities: [
      User,
      AnonymousUser,
      UserAnonymousUser,
      AnonymousConfession,
      Comment,
      Reaction,
      Tag,
      ConfessionTag,
      Tip,
    ],
    synchronize: false,
  });

  // Connect
  try {
    await dataSource.initialize();
    console.log('✅ Database connected.\n');
  } catch (err: any) {
    console.error(`❌ Database connection failed: ${err.message}`);
    process.exit(1);
  }

  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();

  const userRepo = dataSource.getRepository(User);
  const anonUserRepo = dataSource.getRepository(AnonymousUser);
  const linkRepo = dataSource.getRepository(UserAnonymousUser);
  const confessionRepo = dataSource.getRepository(AnonymousConfession);
  const commentRepo = dataSource.getRepository(Comment);
  const reactionRepo = dataSource.getRepository(Reaction);
  const tagRepo = dataSource.getRepository(Tag);
  const confessionTagRepo = dataSource.getRepository(ConfessionTag);
  const tipRepo = dataSource.getRepository(Tip);

  try {
    // ── 1. Create demo users ──────────────────────────────────────────────
    console.log('👤 Creating demo users...');
    const admin = await upsertUser(userRepo, DEMO_ADMIN.username, DEMO_ADMIN.email, DEMO_ADMIN.password, UserRole.ADMIN);
    const regularUser = await upsertUser(userRepo, DEMO_USER.username, DEMO_USER.email, DEMO_USER.password, UserRole.USER);
    const demoUsers = [admin, regularUser];

    // ── 2. Create anonymous users and link to demo users ──────────────────
    console.log('\n🎭 Creating anonymous users...');
    const anonUsers: AnonymousUser[] = [];
    for (const user of demoUsers) {
      // Check for existing link
      const existingLink = await linkRepo.findOne({ where: { userId: user.id } });
      if (existingLink) {
        const existingAnon = await anonUserRepo.findOne({ where: { id: existingLink.anonymousUserId } });
        if (existingAnon) {
          console.log(`  User "${user.username}" already linked to anon user ${existingAnon.id}, skipping.`);
          anonUsers.push(existingAnon);
          continue;
        }
      }

      const anonUser = anonUserRepo.create({});
      const savedAnon = await anonUserRepo.save(anonUser);

      const link = linkRepo.create({
        userId: user.id,
        anonymousUserId: savedAnon.id,
      });
      await linkRepo.save(link);

      console.log(`  Created anonymous user ${savedAnon.id} linked to "${user.username}"`);
      anonUsers.push(savedAnon);
    }

    // Create extra anonymous users for variety
    for (let i = 0; i < 3; i++) {
      const anon = anonUserRepo.create({});
      const saved = await anonUserRepo.save(anon);
      anonUsers.push(saved);
      console.log(`  Created anonymous user ${saved.id} (unlinked)`);
    }

    // ── 3. Create tags ────────────────────────────────────────────────────
    console.log('\n🏷️  Creating tags...');
    const tagMap: Record<string, Tag> = {};
    for (const t of DEMO_TAGS) {
      tagMap[t.name] = await upsertTag(tagRepo, t.name, t.description);
    }

    // ── 4. Create confessions ─────────────────────────────────────────────
    console.log('\n💬 Creating confessions...');
    for (let i = 0; i < DEMO_CONFESSIONS.length; i++) {
      const dc = DEMO_CONFESSIONS[i];
      const authorAnon = anonUsers[i % anonUsers.length];

      // Check if confession already exists (by message hash)
      const msgHash = crypto.createHash('sha256').update(dc.message).digest('hex');
      const existing = await confessionRepo
        .createQueryBuilder('c')
        .where('c.message = :msg', { msg: dc.message })
        .getOne();

      if (existing) {
        console.log(`  Confession already exists (id=${existing.id}), skipping.`);
        continue;
      }

      const confession = confessionRepo.create({
        message: dc.message,
        gender: dc.gender,
        anonymousUser: authorAnon,
      });
      const savedConfession = await confessionRepo.save(confession);
      console.log(`  Created confession ${savedConfession.id} (${dc.message.substring(0, 40)}...)`);

      // Link tags
      for (const tagName of dc.tags) {
        const tag = tagMap[tagName];
        if (tag) {
          const ct = confessionTagRepo.create({
            confession: savedConfession,
            tag,
          });
          await confessionTagRepo.save(ct);
        }
      }

      // ── 5. Create reactions ────────────────────────────────────────────
      for (const r of dc.reactions) {
        for (let j = 0; j < r.count; j++) {
          const reactorAnon = anonUsers[(i + j + 1) % anonUsers.length];
          const reaction = reactionRepo.create({
            emoji: r.emoji,
            confession: savedConfession,
            anonymousUser: reactorAnon,
          });
          await reactionRepo.save(reaction);
        }
      }
      const totalReactions = dc.reactions.reduce((sum, r) => sum + r.count, 0);
      console.log(`    Added ${totalReactions} reactions`);

      // ── 6. Create comments ────────────────────────────────────────────
      for (const commentText of dc.comments) {
        const commenterAnon = anonUsers[(i + 1) % anonUsers.length];
        const comment = commentRepo.create({
          content: commentText,
          confession: savedConfession,
          anonymousUser: commenterAnon,
        });
        await commentRepo.save(comment);
      }
      console.log(`    Added ${dc.comments.length} comments`);
    }

    // ── 7. Create sample tips ─────────────────────────────────────────────
    console.log('\n💰 Creating sample tips...');
    const allConfessions = await confessionRepo.find({ take: 3 });
    const tipAmounts = ['5.0000000', '10.0000000', '2.5000000'];
    for (let i = 0; i < allConfessions.length; i++) {
      const confession = allConfessions[i];
      const tipId = crypto.randomUUID();
      const tip = tipRepo.create({
        id: tipId,
        confessionId: confession.id,
        amount: tipAmounts[i],
        txId: crypto.randomBytes(32).toString('hex'),
        idempotencyKey: `seed-tip-${i}-${Date.now()}`,
        senderAddress: 'GDEMO' + crypto.randomBytes(28).toString('hex').toUpperCase().substring(0, 28),
        verificationStatus: TipVerificationStatus.VERIFIED,
      });
      await tipRepo.save(tip);
      console.log(`  Created tip of ${tipAmounts[i]} XLM on confession ${confession.id.substring(0, 8)}...`);
    }

    // ── Summary ───────────────────────────────────────────────────────────
    const userCount = await userRepo.count();
    const anonCount = await anonUserRepo.count();
    const confessionCount = await confessionRepo.count();
    const commentCount = await commentRepo.count();
    const reactionCount = await reactionRepo.count();
    const tagCount = await tagRepo.count();
    const tipCount = await tipRepo.count();

    console.log('\n✅ Seed complete!');
    console.log('═══════════════════════════════════════════════');
    console.log(`  Users:        ${userCount}`);
    console.log(`  Anonymous:    ${anonCount}`);
    console.log(`  Confessions:  ${confessionCount}`);
    console.log(`  Comments:     ${commentCount}`);
    console.log(`  Reactions:    ${reactionCount}`);
    console.log(`  Tags:         ${tagCount}`);
    console.log(`  Tips:         ${tipCount}`);
    console.log('═══════════════════════════════════════════════');
    console.log('\n📋 Demo credentials:');
    console.log(`  Admin:  ${DEMO_ADMIN.username} / ${DEMO_ADMIN.password}`);
    console.log(`  User:   ${DEMO_USER.username} / ${DEMO_USER.password}`);
    console.log('\n🚀 Your local demo is ready!');

  } catch (err: any) {
    console.error(`\n❌ Seed failed: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
}

seed();
