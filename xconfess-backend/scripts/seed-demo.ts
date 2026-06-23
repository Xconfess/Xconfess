#!/usr/bin/env ts-node
/**
 * seed-demo.ts — Idempotent demo-data seeder for xConfess local development.
 *
 * Creates (or upserts) admin + regular users, anonymous users, confessions,
 * reactions, comments, and tips. Safe to re-run; uses ON CONFLICT upsert
 * patterns so it never duplicates data.
 *
 * Usage:
 *   cd xconfess-backend
 *   npx ts-node -r tsconfig-paths/register scripts/seed-demo.ts
 *
 * Or via npm:
 *   npm run seed:demo
 *
 * Exits with code 1 on DB connection failure.
 */

import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { getTypeOrmConfig } from '../src/config/database.config';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ENCRYPTION_KEY =
  process.env.EMAIL_ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function encryptEmail(text: string): {
  encrypted: string;
  iv: string;
  tag: string;
} {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY),
    iv,
  );
  const encrypted =
    cipher.update(text, 'utf8', 'base64') + cipher.final('base64');
  const tag = cipher.getAuthTag();
  return { encrypted, iv: iv.toString('base64'), tag: tag.toString('base64') };
}

function hashEmail(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

// ---------------------------------------------------------------------------
// Demo credentials (non-secret, for local dev only)
// ---------------------------------------------------------------------------

const DEMO_ADMIN = {
  username: 'demo-admin',
  email: 'admin@demo.local',
  password: 'DemoAdmin!2026',
};

const DEMO_USER = {
  username: 'demo-user',
  email: 'user@demo.local',
  password: 'DemoUser!2026',
};

// ---------------------------------------------------------------------------
// Build a standalone DataSource (no NestJS bootstrap needed)
// ---------------------------------------------------------------------------

function buildDataSource(): DataSource {
  // Mimic what ConfigService would return from .env
  const config = new ConfigService();
  const ormConfig = getTypeOrmConfig(config);

  const ds = new DataSource({
    ...ormConfig,
    // We only need entities we touch explicitly — speeds up init
    entities: [__dirname + '/../src/**/*.entity{.ts,.js}'],
  } as DataSourceOptions);

  return ds;
}

// ---------------------------------------------------------------------------
// Seed logic
// ---------------------------------------------------------------------------

async function seed() {
  const ds = buildDataSource();

  try {
    await ds.initialize();
  } catch (err: any) {
    console.error(
      '❌ Database connection failed — cannot run seed script.',
    );
    console.error('   Details:', err.message || err);
    process.exit(1);
  }

  console.log('✅ Database connected. Starting idempotent seed...\n');

  const queryRunner = ds.createQueryRunner();
  await queryRunner.startTransaction();

  try {
    // ------------------------------------------------------------------
    // 1. Users (upsert by unique username)
    // ------------------------------------------------------------------
    const adminPasswordHash = await bcrypt.hash(DEMO_ADMIN.password, 12);
  const userPasswordHash = await bcrypt.hash(DEMO_USER.password, 12);

  const adminEmailEnc = encryptEmail(DEMO_ADMIN.email);
  const adminEmailHash = hashEmail(DEMO_ADMIN.email);
  const userEmailEnc = encryptEmail(DEMO_USER.email);
  const userEmailHash = hashEmail(DEMO_USER.email);

  // Upsert admin user
  await queryRunner.query(
    `
    INSERT INTO "user" (username, password, email_encrypted, email_iv, email_tag, email_hash, role, is_active, notification_preferences, privacy_settings, "createdAt", "updatedAt")
    VALUES ($1, $2, $3, $4, $5, $6, 'admin', true,
            '{"message":true,"reaction":true,"moderation":true,"system":true}',
            '{"isDiscoverable":true,"canReceiveReplies":true,"showReactions":true,"dataProcessingConsent":true}',
            NOW(), NOW())
    ON CONFLICT (username) DO UPDATE SET
      password = EXCLUDED.password,
      email_encrypted = EXCLUDED.email_encrypted,
      email_iv = EXCLUDED.email_iv,
      email_tag = EXCLUDED.email_tag,
      email_hash = EXCLUDED.email_hash,
      role = 'admin',
      is_active = true,
      "updatedAt" = NOW()
    RETURNING id
    `,
    [
      DEMO_ADMIN.username,
      adminPasswordHash,
      adminEmailEnc.encrypted,
      adminEmailEnc.iv,
      adminEmailEnc.tag,
      adminEmailHash,
    ],
  );

  // Upsert regular user
  await queryRunner.query(
    `
    INSERT INTO "user" (username, password, email_encrypted, email_iv, email_tag, email_hash, role, is_active, notification_preferences, privacy_settings, "createdAt", "updatedAt")
    VALUES ($1, $2, $3, $4, $5, $6, 'user', true,
            '{"message":true,"reaction":true,"moderation":true,"system":true}',
            '{"isDiscoverable":true,"canReceiveReplies":true,"showReactions":true,"dataProcessingConsent":true}',
            NOW(), NOW())
    ON CONFLICT (username) DO UPDATE SET
      password = EXCLUDED.password,
      email_encrypted = EXCLUDED.email_encrypted,
      email_iv = EXCLUDED.email_iv,
      email_tag = EXCLUDED.email_tag,
      email_hash = EXCLUDED.email_hash,
      role = 'user',
      is_active = true,
      "updatedAt" = NOW()
    RETURNING id
    `,
    [
      DEMO_USER.username,
      userPasswordHash,
      userEmailEnc.encrypted,
      userEmailEnc.iv,
      userEmailEnc.tag,
      userEmailHash,
    ],
  );

  console.log('  👤 Upserted admin user:  demo-admin');
  console.log('  👤 Upserted regular user: demo-user');

  // Fetch the user IDs for linking
  const [adminUserRow] = await queryRunner.query(
    `SELECT id FROM "user" WHERE username = $1`,
    [DEMO_ADMIN.username],
  );
  const [regularUserRow] = await queryRunner.query(
    `SELECT id FROM "user" WHERE username = $1`,
    [DEMO_USER.username],
  );

  // ------------------------------------------------------------------
    // 2. Anonymous users (upsert by deterministic UUID derived from username)
    // ------------------------------------------------------------------
  const adminAnonId = uuidv4();
  const userAnonId = uuidv4();

  await queryRunner.query(
    `
    INSERT INTO "anonymous_user" (id, "createdAt")
    VALUES ($1, NOW())
    ON CONFLICT DO NOTHING
    `,
    [adminAnonId],
  );

  await queryRunner.query(
    `
    INSERT INTO "anonymous_user" (id, "createdAt")
    VALUES ($1, NOW())
    ON CONFLICT DO NOTHING
    `,
    [userAnonId],
  );

  console.log('  🎭 Upserted 2 anonymous users');

  // ------------------------------------------------------------------
    // 3. User ↔ Anonymous links (upsert)
    // ------------------------------------------------------------------
  await queryRunner.query(
    `
    INSERT INTO "user_anonymous_users" (id, user_id, anonymous_user_id, "createdAt")
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT DO NOTHING
    `,
    [uuidv4(), adminUserRow.id, adminAnonId],
  );

  await queryRunner.query(
    `
    INSERT INTO "user_anonymous_users" (id, user_id, anonymous_user_id, "createdAt")
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT DO NOTHING
    `,
    [uuidv4(), regularUserRow.id, userAnonId],
  );

  console.log('  🔗 Linked users to anonymous identities');

  // ------------------------------------------------------------------
    // 4. Confessions (upsert by deterministic UUID)
    // ------------------------------------------------------------------
  const confessions = [
    {
      id: uuidv4(),
      message:
        'Just submitted my first pull request! The code review feedback was tough but I learned so much. 🎉',
      gender: 'other' as const,
      anonymousUserId: adminAnonId,
    },
    {
      id: uuidv4(),
      message:
        'Sometimes I feel like I am impostor-syndroming my way through every standup. Anyone else?',
      gender: 'male' as const,
      anonymousUserId: userAnonId,
    },
    {
      id: uuidv4(),
      message:
        'My cat sat on my keyboard and accidentally deployed to prod. Best feature I shipped all year. 🐱',
      gender: 'female' as const,
      anonymousUserId: adminAnonId,
    },
    {
      id: uuidv4(),
      message:
        'Took a mental health day today. No guilt. Rest is productive too.',
      gender: 'other' as const,
      anonymousUserId: userAnonId,
    },
    {
      id: uuidv4(),
      message:
        'Finally understood recursion after 3 years of dev. The stack overflows have stopped. Mostly.',
      gender: 'male' as const,
      anonymousUserId: adminAnonId,
    },
  ];

  for (const c of confessions) {
    await queryRunner.query(
      `
      INSERT INTO "anonymous_confessions"
        (id, message, gender, anonymous_user_id, view_count, "isDeleted", "moderationScore", "moderationFlags", "moderationStatus", "requiresReview", "isHidden", "moderationDetails", "createdAt")
      VALUES ($1, $2, $3, $4, $5, false, 0.0, '{}', 'approved', false, false, '{}', NOW())
      ON CONFLICT DO NOTHING
      `,
      [c.id, c.message, c.gender, c.anonymousUserId, Math.floor(Math.random() * 200)],
    );
  }

  console.log(`  📝 Upserted ${confessions.length} confessions`);

  // ------------------------------------------------------------------
    // 5. Reactions (upsert by deterministic UUID per confession+emoji+user)
    // ------------------------------------------------------------------
  const reactionEmojis = ['❤️', '😂', '🔥', '👏', '😢'];
  let reactionCount = 0;

  for (const c of confessions) {
    // Each confession gets 2-3 random reactions from different anonymous users
    const targetAnonIds = [adminAnonId, userAnonId];
    const numReactions = 2 + Math.floor(Math.random() * 2);
    const shuffled = [...reactionEmojis].sort(() => Math.random() - 0.5);

    for (let i = 0; i < numReactions; i++) {
      const reactionId = uuidv4();
      const emoji = shuffled[i % shuffled.length];
      const reactorAnonId =
        targetAnonIds[Math.floor(Math.random() * targetAnonIds.length)];

      await queryRunner.query(
        `
        INSERT INTO "reaction" (id, emoji, confession_id, anonymous_user_id, "createdAt")
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT DO NOTHING
        `,
        [reactionId, emoji, c.id, reactorAnonId],
      );
      reactionCount++;
    }
  }

  console.log(`  👍 Upserted ${reactionCount} reactions`);

  // ------------------------------------------------------------------
    // 6. Comments (upsert by deterministic UUID)
  // ------------------------------------------------------------------
  const commentTexts = [
    'This resonates so much with me!',
    'Sending virtual hugs. You are not alone.',
    'LOL my cat did the same thing 😂',
    'Proud of you for taking that step!',
    'Recursion is just recursion calling recursion, right?',
    'Take all the rest you need. Seriously.',
    'The best developers are the ones who keep learning.',
    'I needed to hear this today. Thank you.',
  ];

  let commentCount = 0;

  for (const c of confessions) {
    const numComments = 1 + Math.floor(Math.random() * 3);
    const commenterAnonIds = [adminAnonId, userAnonId];

    for (let i = 0; i < numComments; i++) {
      const commentId = uuidv4();
      const text = commentTexts[commentCount % commentTexts.length];
      const commenterAnonId =
        commenterAnonIds[commentCount % commenterAnonIds.length];

      await queryRunner.query(
        `
        INSERT INTO "comments" (id, content, "anonymousUser", "confessionId", "anonymousContextId", "isDeleted", "createdAt")
        VALUES ($1, $2, $3, $4, $5, false, NOW())
        ON CONFLICT DO NOTHING
        `,
        [commentId, text, commenterAnonId, c.id, commenterAnonId],
      );
      commentCount++;
    }
  }

  console.log(`  💬 Upserted ${commentCount} comments`);

  // ------------------------------------------------------------------
    // 7. Tips (upsert by deterministic tx_id)
  // ------------------------------------------------------------------
  let tipCount = 0;

  for (const c of confessions.slice(0, 3)) {
    const numTips = Math.floor(Math.random() * 2) + 1;

    for (let i = 0; i < numTips; i++) {
      const tipId = uuidv4();
      const txId = `demo-tx-${tipId.slice(0, 8)}`;
      const amount = parseFloat((Math.random() * 5 + 0.5).toFixed(4));

      await queryRunner.query(
        `
        INSERT INTO "tips"
          (id, confession_id, amount, tx_id, idempotency_key, sender_address,
           verification_status, "verifiedAt", "retryCount", "lastChainStatus",
           "lastCheckedAt", "reconciliationMetadata", "processingLock",
           "lockedAt", "lockedBy", "createdAt")
        VALUES ($1, $2, $3, $4, $5, $6,
                'verified', NOW(), 0, 'confirmed',
                NOW(), '{}', null,
                null, null, NOW())
        ON CONFLICT (tx_id) DO NOTHING
        `,
        [
          tipId,
          c.id,
          amount,
          txId,
          `demo-idempotent-${tipId.slice(0, 8)}`,
          `GDEMO${uuidv4().replace(/-/g, '').slice(0, 52).toUpperCase()}`,
        ],
      );
      tipCount++;
    }
  }

  console.log(`  💰 Upserted ${tipCount} tips`);

  // ------------------------------------------------------------------
  // Commit
  // ------------------------------------------------------------------
  await queryRunner.commitTransaction();
  console.log('\n✅ Seed complete! Demo data is ready.\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Demo Credentials (local development only)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Admin:  username=${DEMO_ADMIN.username}  password=${DEMO_ADMIN.password}`);
  console.log(`  User:   username=${DEMO_USER.username}  password=${DEMO_USER.password}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  await ds.destroy();
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

seed().catch(async (err) => {
  console.error('\n❌ Seed script failed with error:');
  console.error(err);
  process.exit(1);
});
