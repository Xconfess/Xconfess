/**
 * Wave 5 Demo Seed Script
 *
 * Creates demo users, confessions, reactions, comments, and sample tips
 * for GrantFox demos and contributor onboarding.
 *
 * Usage:
 *   npm run seed:demo
 *
 * Environment variables (optional):
 *   DATABASE_URL - PostgreSQL connection string
 *   SEED_USERS - Number of demo users to create (default: 3)
 *   SESSIONS_PER_USER - Number of confessions per user (default: 3)
 */

import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';

// Note: Environment variables should be loaded before running this script.
// The backend .env file is loaded via the application config, not here.
// For local development, ensure DATABASE_URL or DB_HOST is set.

// ============================================================
// Demo data constants
// ============================================================

const DEMO_USERS = [
  { username: 'demo_admin', email: 'admin@xconfess.local', role: 'admin', password: 'Admin123!' },
  { username: 'demo_user', email: 'user@xconfess.local', role: 'user', password: 'User123!' },
  { username: 'demo_viewer', email: 'viewer@xconfess.local', role: 'user', password: 'Viewer123!' },
];

const DEMO_CONFESSIONS = [
  { message: 'I secretly enjoy watching reality TV shows after a long day of coding.', gender: 'male', tags: ['humor', 'coding'], moderationStatus: 'approved' },
  { message: 'Sometimes I push to main on Friday at 4:59pm and hope for the best.', gender: 'female', tags: ['programming', 'humor'], moderationStatus: 'approved' },
  { message: 'I have been working on the same bug for 3 weeks and still cannot figure it out.', gender: 'male', tags: ['bugs', 'struggle'], moderationStatus: 'approved' },
  { message: 'I pretend to understand monads but I actually have no idea what they do.', gender: 'female', tags: ['functional', 'humor'], moderationStatus: 'approved' },
  { message: 'My first open-source PR was just fixing a typo in the README and I was so proud.', gender: 'male', tags: ['opensource', 'beginner'], moderationStatus: 'approved' },
  { message: 'I once deployed a database migration without testing it in staging. Never again.', gender: 'female', tags: ['devops', 'learning'], moderationStatus: 'approved' },
  { message: 'I still use var in JavaScript out of habit. Please do not judge me.', gender: 'male', tags: ['javascript', 'humor'], moderationStatus: 'approved' },
  { message: 'I wrote a 500-line function once. It was a CRUD endpoint that did everything.', gender: 'female', tags: ['coding', 'humor'], moderationStatus: 'approved' },
  { message: 'Docker changed my life. I went from works on my machine to works on everyone machine.', gender: 'male', tags: ['docker', 'devops'], moderationStatus: 'approved' },
  { message: 'I accidentally committed .env to a public repo once. I still have nightmares.', gender: 'female', tags: ['security', 'learning'], moderationStatus: 'approved' },
  { message: 'The best code is no code. Yet I keep writing more code.', gender: 'male', tags: ['philosophy', 'coding'], moderationStatus: 'approved' },
  { message: 'I spent 4 hours debugging only to find a missing semicolon. Classic.', gender: 'female', tags: ['debugging', 'humor'], moderationStatus: 'approved' },
];

const DEMO_COMMENTS = [
  'This is so relatable!',
  'I feel seen right now.',
  'Same here, friend.',
  'This made my day.',
  'We have all been there.',
  'Truth hurts.',
  'Cannot lie, this is accurate.',
  'Story of my life.',
  'I wish I could upvote this twice.',
  'This hits different.',
];

const DEMO_REACTIONS = ['like', 'love', 'laugh', 'sad', 'angry'];

const DEMO_TIPS = [
  { amount: 10 },
  { amount: 25 },
  { amount: 50 },
  { amount: 100 },
];

// ============================================================
// Helpers
// ============================================================

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDate(daysAgo: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - randomInt(0, daysAgo));
  d.setHours(randomInt(0, 23), randomInt(0, 59), randomInt(0, 59));
  return d;
}

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

// ============================================================
// Seed logic
// ============================================================

async function seed() {
  const dbUrl = process.env.DATABASE_URL || process.env.DB_HOST
    || 'postgresql://postgres:postgres@localhost:5432/xconfess';

  const dataSource = new DataSource({
    type: 'postgres' as const,
    url: dbUrl,
    entities: [path.resolve(__dirname, '..', 'src', '**', '*.entity.ts')],
    synchronize: false,
    logging: false,
  });

  console.log('[seed:demo] Connecting to database...');
  await dataSource.initialize();
  console.log('[seed:demo] Connected.');

  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const userRepo = queryRunner.manager.getRepository('users');
    const anonUserRepo = queryRunner.manager.getRepository('anonymous_users');
    const confessionRepo = queryRunner.manager.getRepository('anonymous_confessions');
    const commentRepo = queryRunner.manager.getRepository('comments');
    const reactionRepo = queryRunner.manager.getRepository('reactions');
    const tagRepo = queryRunner.manager.getRepository('tags');
    const confessionTagRepo = queryRunner.manager.getRepository('confession_tags');
    const moderationRepo = queryRunner.manager.getRepository('moderation_comments');
    const outboxRepo = queryRunner.manager.getRepository('outbox_events');
    const tipRepo = queryRunner.manager.getRepository('tips');

    // ----------------------------------------------------------
    // 1. Create users
    // ----------------------------------------------------------
    console.log(`[seed:demo] Creating ${DEMO_USERS.length} demo users...`);
    const createdUsers: any[] = [];
    for (const demoUser of DEMO_USERS) {
      const existing = await userRepo.findOne({ where: { username: demoUser.username } });
      if (existing) {
        console.log(`  - User "${demoUser.username}" already exists, skipping.`);
        createdUsers.push(existing);
        continue;
      }

      const hashedPassword = await hashPassword(demoUser.password);
      const emailHash = Buffer.from(demoUser.email).toString('base64');
      const emailIv = Buffer.from('demo-iv-16bytes!').toString('base64');
      const emailTag = Buffer.from('demo-tag-16bytes').toString('base64');

      const user = userRepo.create({
        username: demoUser.username,
        password: hashedPassword,
        emailEncrypted: emailHash,
        emailIv: emailIv,
        emailTag: emailTag,
        emailHash: emailHash,
        role: demoUser.role,
        is_active: true,
        notificationPreferences: {},
        privacySettings: {
          isDiscoverable: true,
          canReceiveReplies: true,
          showReactions: true,
          dataProcessingConsent: true,
        },
      });

      const saved = await queryRunner.manager.save(user);
      createdUsers.push(saved);
      console.log(`  + Created user: ${demoUser.username} (${demoUser.role})`);
    }

    // ----------------------------------------------------------
    // 2. Create anonymous users for confessions
    // ----------------------------------------------------------
    console.log('[seed:demo] Creating anonymous users for confessions...');
    const createdAnonUsers: any[] = [];
    // Create regular anonymous users
    for (let i = 0; i < 8; i++) {
      const existing = await anonUserRepo.findOne({ where: { displayName: `anon-seed-${i}` } });
      if (existing) {
        createdAnonUsers.push(existing);
        continue;
      }
      const anonUser = anonUserRepo.create({
        displayName: `anon-seed-${i}`,
        createdAt: randomDate(30),
      });
      const saved = await queryRunner.manager.save(anonUser);
      createdAnonUsers.push(saved);
    }

    // Link first anon user to the demo user
    if (createdUsers.length > 0 && createdAnonUsers.length > 0) {
      const linkRepo = queryRunner.manager.getRepository('user_anonymous_links');
      const existingLink = await linkRepo.findOne({
        where: { userId: createdUsers[0].id, anonymousUserId: createdAnonUsers[0].id },
      });
      if (!existingLink) {
        await queryRunner.manager.save(linkRepo.create({
          userId: createdUsers[0].id,
          anonymousUserId: createdAnonUsers[0].id,
        }));
        console.log(`  + Linked user "${createdUsers[0].username}" to anon user`);
      }
    }
    console.log(`  + ${createdAnonUsers.length} anonymous users ready`);

    // ----------------------------------------------------------
    // 3. Create tags
    // ----------------------------------------------------------
    console.log('[seed:demo] Creating tags...');
    const allTags = new Set<string>();
    DEMO_CONFESSIONS.forEach(c => c.tags.forEach(t => allTags.add(t)));
    const createdTags: Record<string, any> = {};
    for (const tagName of allTags) {
      let tag = await tagRepo.findOne({ where: { name: tagName } });
      if (!tag) {
        tag = tagRepo.create({ name: tagName });
        tag = await queryRunner.manager.save(tag);
      }
      createdTags[tagName] = tag;
    }
    console.log(`  + ${Object.keys(createdTags).length} tags ready`);

    // ----------------------------------------------------------
    // 4. Create confessions
    // ----------------------------------------------------------
    console.log(`[seed:demo] Creating ${DEMO_CONFESSIONS.length} demo confessions...`);
    const createdConfessions: any[] = [];
    for (let i = 0; i < DEMO_CONFESSIONS.length; i++) {
      const demo = DEMO_CONFESSIONS[i];
      const anonUser = createdAnonUsers[i % createdAnonUsers.length];

      const confession = confessionRepo.create({
        message: demo.message,
        gender: demo.gender,
        anonymousUser: anonUser,
        anonymousUserId: anonUser.id,
        view_count: randomInt(10, 500),
        isDeleted: false,
        moderationStatus: demo.moderationStatus,
        moderationScore: Math.random() * 0.3,
        moderationFlags: [],
        requiresReview: false,
        isHidden: false,
        moderationDetails: {},
        created_at: randomDate(30),
      });

      const saved = await queryRunner.manager.save(confession);
      createdConfessions.push(saved);

      // Create moderation entry
      await queryRunner.manager.save(moderationRepo.create({
        commentId: null,
        comment: null,
        status: demo.moderationStatus === 'approved' ? 'approved' : 'pending',
        moderatedAt: new Date(),
        moderatedById: createdUsers[0]?.id,
      }));

      // Create confession tags
        if (demo.tags) {
          for (const tagName of demo.tags) {
            const tag = createdTags[tagName];
            if (tag) {
              await queryRunner.manager.save(confessionTagRepo.create({
                confessionId: saved.id,
                tagId: tag.id,
              }));
            }
          }
        }

      // Create reactions
      const reactionCount = randomInt(0, 15);
      for (let r = 0; r < reactionCount; r++) {
        const reactionAnonUser = randomChoice(createdAnonUsers);
        await queryRunner.manager.save(reactionRepo.create({
          emoji: randomChoice(DEMO_REACTIONS),
          confessionId: saved.id,
          anonymousUserId: reactionAnonUser.id,
          createdAt: randomDate(14),
        }));
      }
    }
    console.log(`  + ${createdConfessions.length} confessions created`);

    // ----------------------------------------------------------
    // 5. Create comments
    // ----------------------------------------------------------
    console.log('[seed:demo] Creating comments on confessions...');
    let commentCount = 0;
    for (const confession of createdConfessions) {
      const numComments = randomInt(0, 5);
      for (let c = 0; c < numComments; c++) {
        const commentAnonUser = randomChoice(createdAnonUsers);
        const comment = commentRepo.create({
          content: randomChoice(DEMO_COMMENTS),
          anonymousUser: commentAnonUser,
          confession: confession,
          anonymousContextId: uuidv4(),
          isDeleted: false,
          createdAt: randomDate(14),
        });
        const savedComment = await queryRunner.manager.save(comment);

        // Moderation entry
        await queryRunner.manager.save(moderationRepo.create({
          commentId: savedComment.id,
          comment: savedComment,
          status: 'approved',
          moderatedAt: new Date(),
        }));

        commentCount++;
      }
    }
    console.log(`  + ${commentCount} comments created`);

    // ----------------------------------------------------------
    // 6. Create sample tips
    // ----------------------------------------------------------
    console.log('[seed:demo] Creating sample tips...');
    let tipCount = 0;
    for (let i = 0; i < Math.min(6, createdConfessions.length); i++) {
      const confession = createdConfessions[i];
      const tipDemo = randomChoice(DEMO_TIPS);
      const tipperAnonUser = randomChoice(createdAnonUsers);

      if (tipRepo) {
        try {
          await queryRunner.manager.save(tipRepo.create({
            amount: tipDemo.amount,
            confessionId: confession.id,
            tipperUserId: tipperAnonUser.id,
            status: 'completed',
            createdAt: randomDate(7),
          }));
          tipCount++;
        } catch (e) {
          // Tips table might have different schema, skip if fails
        }
      }
    }
    console.log(`  + ${tipCount} tips created`);

    // ----------------------------------------------------------
    // 7. Create outbox events for notification demo
    // ----------------------------------------------------------
    console.log('[seed:demo] Creating sample outbox events...');
    let outboxCount = 0;
    for (let i = 0; i < Math.min(5, createdConfessions.length); i++) {
      const confession = createdConfessions[i];
      try {
        await queryRunner.manager.save(outboxRepo.create({
          type: 'comment_notification',
          payload: {
            confessionId: confession.id,
            commentPreview: randomChoice(DEMO_COMMENTS),
          },
          idempotencyKey: `seed:outbox:${confession.id}`,
          status: 'pending',
          createdAt: randomDate(3),
        }));
        outboxCount++;
      } catch (e) {
        // Outbox schema may vary
      }
    }
    console.log(`  + ${outboxCount} outbox events created`);

    // ----------------------------------------------------------
    // Summary
    // ----------------------------------------------------------
    await queryRunner.commitTransaction();
    console.log('');
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║          Seed Complete — Demo Data Ready            ║');
    console.log('╠══════════════════════════════════════════════════════╣');
    console.log(`║  Users:        ${createdUsers.length.toString().padEnd(39)}║`);
    console.log(`║  Confessions:  ${createdConfessions.length.toString().padEnd(39)}║`);
    console.log(`║  Comments:     ${commentCount.toString().padEnd(39)}║`);
    console.log(`║  Tips:         ${tipCount.toString().padEnd(39)}║`);
    console.log('╠══════════════════════════════════════════════════════╣');
    console.log('║  Login credentials:                                  ║');
    for (const u of DEMO_USERS) {
      const line = `  ${u.username} / ${u.password}`;
      console.log(`║  ${line.padEnd(53)}║`);
    }
    console.log('╚══════════════════════════════════════════════════════╝');

  } catch (error) {
    console.error('[seed:demo] Error during seed:', error);
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
}

seed().catch((err) => {
  console.error('[seed:demo] Fatal error:', err);
  process.exit(1);
});
