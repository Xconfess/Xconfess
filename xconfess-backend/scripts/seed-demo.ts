/**
 * Wave 5 Demo Seed Script
 *
 * Idempotent CLI seed that creates demo users, confessions, reactions,
 * comments, and sample tips for GrantFox demos and contributor onboarding.
 *
 * Usage:
 *   ts-node -r tsconfig-paths/register scripts/seed-demo.ts
 *
 * Environment variables (defaults from compose.yaml):
 *   DB_HOST=localhost, DB_PORT=55432, DB_USERNAME=postgres,
 *   DB_PASSWORD=postgres, DB_NAME=xconfess
 *
 * Exits non-zero on DB connection failure.
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { createHash, randomBytes } from 'crypto';

// entities
import { User } from '../src/user/entities/user.entity';
import { AnonymousUser } from '../src/user/entities/anonymous-user.entity';
import { UserAnonymousUser } from '../src/user/entities/user-anonymous-link.entity';
import { AnonymousConfession } from '../src/confession/entities/confession.entity';
import { Tag } from '../src/confession/entities/tag.entity';
import { ConfessionTag } from '../src/confession/entities/confession-tag.entity';
import { Reaction } from '../src/reaction/entities/reaction.entity';
import { Comment } from '../src/comment/entities/comment.entity';
import { Tip } from '../src/tipping/entities/tip.entity';
import { Gender } from '../src/confession/dto/get-confessions.dto';

// ── Crypto helpers (mirrors common/crypto.util.ts) ──────────────────────────
const ENCRYPTION_KEY =
  process.env.EMAIL_ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef';

function encryptEmail(text: string): { encrypted: string; iv: string; tag: string } {
  const iv = randomBytes(12);
  const cipher = require('crypto').createCipheriv(
    'aes-256-gcm',
    Buffer.from(ENCRYPTION_KEY),
    iv,
  );
  const encrypted = cipher.update(text, 'utf8', 'base64') + cipher.final('base64');
  const tag = cipher.getAuthTag();
  return {
    encrypted,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

function hashEmail(email: string): string {
  return createHash('sha256').update(email.toLowerCase()).digest('hex');
}

// ── Config ──────────────────────────────────────────────────────────────────
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '55432', 10);
const DB_USERNAME = process.env.DB_USERNAME || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || 'postgres';
const DB_NAME = process.env.DB_NAME || 'xconfess';

// ── Demo data constants ─────────────────────────────────────────────────────
const ADMIN_EMAIL = 'wave-admin@example.com';
const DEMO_PASSWORD = 'demo-password';

const DEMO_CONFESSIONS = [
  { message: 'I finally told my cat about the incident. She judged me silently.', gender: Gender.MALE, tags: ['funny', 'pets'] },
  { message: 'Sometimes I pretend to be on calls just to avoid awkward elevator talk.', gender: Gender.FEMALE, tags: ['relatable', 'work'] },
  { message: 'My houseplant has a name and I apologize to it when I forget to water it.', gender: Gender.OTHER, tags: ['plants', 'wholesome'] },
  { message: 'I ate my roommates leftovers and blamed it on the dog. We do not have a dog.', gender: Gender.MALE, tags: ['funny', 'food'] },
  { message: 'I still sleep with a nightlight and I am 28 years old.', gender: Gender.FEMALE, tags: ['relatable'] },
  { message: 'My playlist is 90% songs I will never admit to liking publicly.', gender: Gender.MALE, tags: ['music', 'guilty-pleasure'] },
  { message: 'I wave back at babies in public who are actually waving at the person behind me.', gender: Gender.FEMALE, tags: ['funny', 'cringe'] },
  { message: 'I have a secret Twitter account where I only follow gardeners.', gender: Gender.OTHER, tags: ['secret', 'hobby'] },
  { message: 'Every time I say "let me know" I hope they just do not let me know.', gender: Gender.MALE, tags: ['work', 'relatable'] },
  { message: 'I once joined a marathon by accident. I was just running for the bus.', gender: Gender.FEMALE, tags: ['funny', 'fitness'] },
  { message: 'My therapist said I should journal. So here we are.', gender: Gender.OTHER, tags: ['mental-health', 'growth'] },
  { message: 'I name all my houseplants after exes and then watch them thrive.', gender: Gender.FEMALE, tags: ['plants', 'funny'] },
];

const REACTION_EMOJIS = ['❤️', '😂', '🔥', '👀', '💯', '🙌', '😢', '🤔'];

const SAMPLE_COMMENTS = [
  'This is so real it hurts',
  'I felt this in my soul',
  'Not me relating to this hard',
  'Sending you good vibes',
  'This made my day',
  'Okay but same though',
  'The silence after telling the cat 💀',
  'Plant parent guilt is real',
  'The no-dog excuse is elite',
  'Accidental marathon queen',
  'Journaling speedrun any%',
  'Thriving plants, thriving healing',
];

const DEMO_TIPS = [
  { amount: '5.0000000', txId: 'tip-demo-001-stellar-tx-hash', senderAddress: 'GDEMO00000000000000000000000000000000000000000000000' },
  { amount: '10.0000000', txId: 'tip-demo-002-stellar-tx-hash', senderAddress: 'GDEMO00000000000000000000000000000000000000000000001' },
  { amount: '2.5000000', txId: 'tip-demo-003-stellar-tx-hash', senderAddress: 'GDEMO00000000000000000000000000000000000000000000002' },
];

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[seed:demo] Connecting to postgres://${DB_USERNAME}@${DB_HOST}:${DB_PORT}/${DB_NAME} ...`);

  const dataSource = new DataSource({
    type: 'postgres',
    host: DB_HOST,
    port: DB_PORT,
    username: DB_USERNAME,
    password: DB_PASSWORD,
    database: DB_NAME,
    entities: [
      User,
      AnonymousUser,
      UserAnonymousUser,
      AnonymousConfession,
      Tag,
      ConfessionTag,
      Reaction,
      Comment,
      Tip,
    ],
    synchronize: false,
    logging: false,
  });

  await dataSource.initialize();
  console.log('[seed:demo] ✓ Database connected');

  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // ── 1. Users ──────────────────────────────────────────────────────────
    const userRepo = dataSource.getRepository(User);

    // Admin user (upsert by emailHash)
    const adminEmailHash = hashEmail(ADMIN_EMAIL);
    const adminEnc = encryptEmail(ADMIN_EMAIL);
    let admin = await userRepo.findOne({ where: { emailHash: adminEmailHash } });
    if (!admin) {
      admin = userRepo.create({
        username: 'wave-admin',
        password: DEMO_PASSWORD,
        emailEncrypted: adminEnc.encrypted,
        emailIv: adminEnc.iv,
        emailTag: adminEnc.tag,
        emailHash: adminEmailHash,
        role: 'admin' as any,
        isActive: true,
        notificationPreferences: {},
        privacySettings: {
          isDiscoverable: true,
          canReceiveReplies: true,
          showReactions: true,
          dataProcessingConsent: true,
        },
      });
      admin = await userRepo.save(admin);
      console.log(`[seed:demo] ✓ Created admin user (id=${admin.id})`);
    } else {
      console.log(`[seed:demo] ✓ Admin user already exists (id=${admin.id})`);
    }

    // Regular demo users
    const regularUsers: User[] = [];
    const regularEmails = [
      'demo-user@example.com',
      'wave-friend@example.com',
      'confession-lurker@example.com',
    ];
    const usernames = ['demo-user', 'wave-friend', 'confession-lurker'];

    for (let i = 0; i < regularEmails.length; i++) {
      const emailHash = hashEmail(regularEmails[i]);
      const enc = encryptEmail(regularEmails[i]);
      let u = await userRepo.findOne({ where: { emailHash } });
      if (!u) {
        u = userRepo.create({
          username: usernames[i],
          password: DEMO_PASSWORD,
          emailEncrypted: enc.encrypted,
          emailIv: enc.iv,
          emailTag: enc.tag,
          emailHash,
          role: 'user' as any,
          isActive: true,
          notificationPreferences: {},
          privacySettings: {
            isDiscoverable: true,
            canReceiveReplies: true,
            showReactions: true,
            dataProcessingConsent: true,
          },
        });
        u = await userRepo.save(u);
        console.log(`[seed:demo] ✓ Created user "${usernames[i]}" (id=${u.id})`);
      } else {
        console.log(`[seed:demo] ✓ User "${usernames[i]}" already exists (id=${u.id})`);
      }
      regularUsers.push(u);
    }

    // ── 2. Anonymous users ────────────────────────────────────────────────
    const anonRepo = dataSource.getRepository(AnonymousUser);
    const allAnonUsers: AnonymousUser[] = [];

    const totalAnonNeeded = DEMO_CONFESSIONS.length + regularUsers.length * 2;
    for (let i = 0; i < totalAnonNeeded; i++) {
      const existing = await anonRepo.findOne({ where: { id: `seed-anon-${i}` } });
      if (!existing) {
        const au = await anonRepo.save(anonRepo.create({ id: `seed-anon-${i}` }));
        allAnonUsers.push(au);
      } else {
        allAnonUsers.push(existing);
      }
    }
    console.log(`[seed:demo] ✓ ${allAnonUsers.length} anonymous users ready`);

    // ── 3. Tags ───────────────────────────────────────────────────────────
    const tagRepo = dataSource.getRepository(Tag);
    const allTagNames = [...new Set(DEMO_CONFESSIONS.flatMap((c) => c.tags))];
    const tagMap: Record<string, Tag> = {};

    for (const name of allTagNames) {
      let tag = await tagRepo.findOne({ where: { name } });
      if (!tag) {
        tag = await tagRepo.save(tagRepo.create({ name, description: `Tag: ${name}` }));
        console.log(`[seed:demo] ✓ Created tag "${name}"`);
      }
      tagMap[name] = tag;
    }
    console.log(`[seed:demo] ✓ ${allTagNames.length} tags ready`);

    // ── 4. Confessions ────────────────────────────────────────────────────
    const confessionRepo = dataSource.getRepository(AnonymousConfession);
    const confessionTagRepo = dataSource.getRepository(ConfessionTag);
    const savedConfessions: AnonymousConfession[] = [];

    for (let i = 0; i < DEMO_CONFESSIONS.length; i++) {
      const def = DEMO_CONFESSIONS[i];
      const anonUser = allAnonUsers[i];

      const existing = await confessionRepo.findOne({
        where: { message: def.message },
      });

      let confession: AnonymousConfession;
      if (!existing) {
        confession = confessionRepo.create({
          message: def.message,
          gender: def.gender,
          anonymousUserId: anonUser.id,
          viewCount: Math.floor(Math.random() * 200) + 10,
          moderationStatus: 'approved',
          moderationScore: 0.05,
          isAnchored: i < 3,
          stellarTxHash: i < 3 ? `seed-stellar-tx-${i}-${randomBytes(16).toString('hex')}` : null,
          stellarHash: i < 3 ? `seed-stellar-hash-${i}-${randomBytes(16).toString('hex')}` : null,
          anchoredAt: i < 3 ? new Date() : null,
        });
        confession = await confessionRepo.save(confession);

        for (const tagName of def.tags) {
          const tag = tagMap[tagName];
          if (tag) {
            await confessionTagRepo.save(
              confessionTagRepo.create({
                confessionId: confession.id,
                tagId: tag.id,
              }),
            );
          }
        }
        console.log(`[seed:demo] ✓ Created confession #${i + 1}: "${def.message.slice(0, 40)}..."`);
      } else {
        confession = existing;
        console.log(`[seed:demo] ✓ Confession already exists: "${def.message.slice(0, 40)}..."`);
      }
      savedConfessions.push(confession);
    }

    // ── 5. Reactions ──────────────────────────────────────────────────────
    const reactionRepo = dataSource.getRepository(Reaction);
    let reactionCount = 0;

    for (let ci = 0; ci < savedConfessions.length; ci++) {
      const confession = savedConfessions[ci];
      const numReactions = 5 + Math.floor(Math.random() * 8);
      const startIdx = DEMO_CONFESSIONS.length + ci * 2;

      for (let r = 0; r < numReactions; r++) {
        const anonIdx = (startIdx + r) % allAnonUsers.length;
        const anonUser = allAnonUsers[anonIdx];
        const emoji = REACTION_EMOJIS[(ci + r) % REACTION_EMOJIS.length];

        const exists = await reactionRepo.findOne({
          where: {
            confessionId: confession.id,
            anonymousUserId: anonUser.id,
            emoji,
          },
        });

        if (!exists) {
          await reactionRepo.save(
            reactionRepo.create({
              confessionId: confession.id,
              anonymousUserId: anonUser.id,
              emoji,
            }),
          );
          reactionCount++;
        }
      }
    }
    console.log(`[seed:demo] ✓ Created ${reactionCount} reactions`);

    // ── 6. Comments ───────────────────────────────────────────────────────
    const commentRepo = dataSource.getRepository(Comment);
    let commentCount = 0;

    for (let ci = 0; ci < savedConfessions.length; ci++) {
      const confession = savedConfessions[ci];
      const numComments = Math.min(2 + Math.floor(Math.random() * 3), SAMPLE_COMMENTS.length);
      const commentStart = (ci * 2) % SAMPLE_COMMENTS.length;

      for (let c = 0; c < numComments; c++) {
        const anonIdx = (DEMO_CONFESSIONS.length + ci + c + 5) % allAnonUsers.length;
        const anonUser = allAnonUsers[anonIdx];
        const content = SAMPLE_COMMENTS[(commentStart + c) % SAMPLE_COMMENTS.length];

        const exists = await commentRepo.findOne({
          where: { content, confessionId: confession.id },
        });

        if (!exists) {
          await commentRepo.save(
            commentRepo.create({
              content,
              anonymousUserId: anonUser.id,
              confessionId: confession.id,
            }),
          );
          commentCount++;
        }
      }
    }
    console.log(`[seed:demo] ✓ Created ${commentCount} comments`);

    // ── 7. Tips ───────────────────────────────────────────────────────────
    const tipRepo = dataSource.getRepository(Tip);
    let tipCount = 0;

    for (let i = 0; i < DEMO_TIPS.length; i++) {
      const def = DEMO_TIPS[i];
      const confession = savedConfessions[i % savedConfessions.length];

      const exists = await tipRepo.findOne({ where: { txId: def.txId } });
      if (!exists) {
        await tipRepo.save(
          tipRepo.create({
            confessionId: confession.id,
            amount: def.amount,
            txId: def.txId,
            senderAddress: def.senderAddress,
            verificationStatus: 'verified',
            verifiedAt: new Date(),
          }),
        );
        tipCount++;
      }
    }
    console.log(`[seed:demo] ✓ Created ${tipCount} tips`);

    await queryRunner.commitTransaction();
    console.log('\n[seed:demo] ✅ Seed complete!');
    console.log(`  Users: 1 admin + ${regularUsers.length} regular`);
    console.log(`  Anonymous users: ${allAnonUsers.length}`);
    console.log(`  Confessions: ${savedConfessions.length}`);
    console.log(`  Reactions: ${reactionCount}`);
    console.log(`  Comments: ${commentCount}`);
    console.log(`  Tips: ${tipCount}`);
    console.log(`\n  Admin email: ${ADMIN_EMAIL}`);
    console.log(`  Demo password: ${DEMO_PASSWORD}`);
  } catch (err) {
    await queryRunner.rollbackTransaction();
    console.error('[seed:demo] ❌ Seed failed:', err);
    process.exitCode = 1;
    throw err;
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
}

main().catch((err) => {
  console.error('[seed:demo] Fatal error:', err);
  process.exit(1);
});
