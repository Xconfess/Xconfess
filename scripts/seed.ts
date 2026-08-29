/**
 * Seed script for xConfess — creates demo data for local development and testing.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/seed.ts
 *   or: npm run seed
 *
 * Idempotent: re-running will not duplicate data (checks for existing seed users).
 * Stellar anchoring is stubbed when STELLAR_FEATURES_ENABLED=false (default).
 *
 * Creates:
 *   - 5 users (1 admin, 4 regular)
 *   - 5 anonymous user sessions
 *   - 20 confessions (varied categories: relationships, work, technology, health, humor)
 *   - 50 reactions
 *   - 20 comments
 *   - 3 reports
 *   - 1 pending notification job
 */

import "reflect-metadata";
import { DataSource } from "typeorm";
import * as dotenv from "dotenv";
import * as path from "path";
import * as crypto from "crypto";
import * as bcrypt from "bcryptjs";

dotenv.config({ path: path.resolve(__dirname, "..", "xconfess-backend", ".env") });

const dbHost = process.env.DB_HOST || "localhost";
const dbPort = parseInt(process.env.DB_PORT || "55432", 10);
const dbUser = process.env.DB_USERNAME || "postgres";
const dbPass = process.env.DB_PASSWORD || "postgres";
const dbName = process.env.DB_NAME || "xconfess";
const stellarFeaturesEnabled = process.env.STELLAR_FEATURES_ENABLED === "true";

const SEED_USER_PREFIX = "seed_";
const TARGET_CONFESSIONS = parseInt(process.env.SEED_CONFESSIONS || "20", 10);
const REACTIONS_COUNT = parseInt(process.env.SEED_REACTIONS || "50", 10);
const COMMENTS_COUNT = parseInt(process.env.SEED_COMMENTS || "20", 10);
const REPORTS_COUNT = parseInt(process.env.SEED_REPORTS || "3", 10);

async function seed() {
  const dataSource = new DataSource({
    type: "postgres",
    host: dbHost,
    port: dbPort,
    username: dbUser,
    password: dbPass,
    database: dbName,
    entities: [path.resolve(__dirname, "..", "xconfess-backend", "src", "**", "*.entity.ts")],
    synchronize: false,
    logging: false,
  });

  await dataSource.initialize();
  console.log("Connected to database.");

  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const manager = queryRunner.manager;

    // ── Check idempotency ──────────────────────────────────────────────────
    const existingSeedUsers = await manager
      .createQueryBuilder()
      .select("u.id")
      .from("user", "u")
      .where("u.username LIKE :prefix", { prefix: `${SEED_USER_PREFIX}%` })
      .getCount();

    if (existingSeedUsers > 0) {
      console.log(
        `Found ${existingSeedUsers} existing seed users. Database already seeded - skipping.`,
      );
      printSeedCredentials();
      await queryRunner.rollbackTransaction();
      return;
    }

    // ── 1. Create Users ────────────────────────────────────────────────────
    const passwordHash = await bcrypt.hash("password123", 10);
    const encryptionKey =
      process.env.CONFESSION_ENCRYPTION_KEY ||
      "0000000000000000000000000000000000000000000000000000000000000000";

    interface SeedUser {
      username: string;
      role: string;
    }

    const seedUsers: SeedUser[] = [
      { username: "seed_admin", role: "admin" },
      { username: "seed_alice", role: "user" },
      { username: "seed_bob", role: "user" },
      { username: "seed_charlie", role: "user" },
      { username: "seed_diana", role: "user" },
    ];

    const userIds: number[] = [];
    for (const su of seedUsers) {
      const email = `${su.username}@example.com`;
      const emailHash = crypto.createHash("sha256").update(email).digest("hex");

      const result = await manager.query(
        `INSERT INTO "user" (username, password, email_encrypted, email_iv, email_tag, email_hash, role, is_active, "notification_preferences", privacy_settings)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, '{}'::jsonb, '{"isDiscoverable":true,"canReceiveReplies":true,"showReactions":true,"dataProcessingConsent":true}'::jsonb)
         ON CONFLICT (username) DO NOTHING
         RETURNING id`,
        [su.username, passwordHash, email, "00", "00", emailHash, su.role],
      );
      if (result.length > 0) {
        userIds.push(result[0].id);
      } else {
        const existing = await manager.query(
          `SELECT id FROM "user" WHERE username = $1`,
          [su.username],
        );
        if (existing.length > 0) userIds.push(existing[0].id);
      }
    }
    console.log(`Created ${userIds.length} users.`);

    // ── 2. Create Anonymous Users ──────────────────────────────────────────
    const anonUserIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const anonId = crypto.randomUUID();
      await manager.query(
        `INSERT INTO "anonymous_user" (id, "createdAt") VALUES ($1, NOW())`,
        [anonId],
      );
      anonUserIds.push(anonId);
    }
    console.log(`Created ${anonUserIds.length} anonymous users.`);

    // ── 3. Link users to anonymous users ───────────────────────────────────
    for (let i = 0; i < 5; i++) {
      await manager.query(
        `INSERT INTO "user_anonymous_users" ("user_id", "anonymous_user_id", "createdAt")
         VALUES ($1, $2, NOW())
         ON CONFLICT DO NOTHING`,
        [userIds[i], anonUserIds[i]],
      );
    }
    console.log("Linked users to anonymous sessions.");

    // ── 4. Create Confessions ──────────────────────────────────────────────
    const confessionCategories = [
      { category: "relationships", messages: [
        "I secretly love rom-coms more than action movies.",
        "I still think about my high school crush sometimes.",
        "My partner doesn't know I'm terrified of commitment.",
        "I have a friendship I maintain purely out of guilt.",
      ]},
      { category: "work", messages: [
        "I automated half my job and nobody knows.",
        "I overstated my Excel skills, then learned on the job.",
        "I take extra long coffee breaks when stressed.",
        "My boss takes credit for my work and I let them.",
      ]},
      { category: "technology", messages: [
        "I still use Windows 7 on my personal laptop.",
        "I pretend to understand crypto conversations.",
        "I have 47 browser tabs open right now.",
        "I delete my search history more than I'd like to admit.",
      ]},
      { category: "health", messages: [
        "I told my doctor I exercise 3x a week. It's... aspirational.",
        "I've been putting off a dental checkup for 3 years.",
        "My fitness tracker judgmentally vibrates at me daily.",
        "I eat a whole pizza by myself and call it 'cheat day' three times a week.",
      ]},
      { category: "humor", messages: [
        "I rehearse conversations in the shower and still mess them up.",
        "I wave at people who weren't actually waving at me.",
        "I've practiced my autograph more times than I've signed actual documents.",
        "I talk to my plants. They're not impressed.",
      ]},
    ];

    // Flatten messages for random sampling when generating many confessions
    const allMessages = confessionCategories.flatMap((c) => c.messages);

    const confessionIds: string[] = [];
    for (let i = 0; i < TARGET_CONFESSIONS; i++) {
      const confessionId = crypto.randomUUID();
      const idempotencyKey = `seed_confession_${confessionId.substring(0, 8)}`;
      const stellarTxHash = stellarFeaturesEnabled
        ? `seed_stellar_tx_${confessionId.substring(0, 8)}`
        : null;

      const msg = allMessages[Math.floor(Math.random() * allMessages.length)];

      await manager.query(
        `INSERT INTO "anonymous_confessions"
         (id, message, gender, "anonymous_user_id", view_count, "isDeleted", "moderation_score", "moderation_status", "requires_review", "is_hidden", "moderation_flags", idempotency_key, "stellar_tx_hash", "stellar_hash", "is_anchored", created_at)
         VALUES ($1, $2, $3, $4, $5, false, 0, 'clean', false, false, '', $6, $7, $8, $9, NOW())`,
        [
          confessionId,
          msg,
          ["male", "female", "other"][Math.floor(Math.random() * 3)],
          anonUserIds[Math.floor(Math.random() * anonUserIds.length)],
          Math.floor(Math.random() * 100),
          idempotencyKey,
          stellarTxHash,
          stellarTxHash ? `hash_${confessionId.substring(0, 8)}` : null,
          stellarFeaturesEnabled,
        ],
      );
      confessionIds.push(confessionId);
      if ((i + 1) % 1000 === 0) {
        console.log(`Inserted ${i + 1} confessions...`);
      }
    }
    console.log(`Created ${confessionIds.length} confessions.`);

    // ── 5. Create Reactions ────────────────────────────────────────────────
    const emojis = ["heart", "laugh", "sad", "fire", "like", "clap", "think", "same"];
    const usedReactionPairs = new Set<string>();
    for (let i = 0; i < REACTIONS_COUNT; i++) {
      const reactionId = crypto.randomUUID();
      const confessionId = confessionIds[i % confessionIds.length];
      const anonUserId = anonUserIds[Math.floor(i / confessionIds.length) % anonUserIds.length];
      const reactionPair = `${confessionId}:${anonUserId}`;

      if (usedReactionPairs.has(reactionPair)) {
        continue;
      }
      usedReactionPairs.add(reactionPair);

      await manager.query(
        `INSERT INTO "reaction" (id, emoji, "confession_id", "anonymous_user_id", created_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT ("confession_id", "anonymous_user_id") DO NOTHING`,
        [
          reactionId,
          emojis[i % emojis.length],
          confessionId,
          anonUserId,
        ],
      );
    }
    console.log(`Created ${usedReactionPairs.size} reactions.`);

    // ── 6. Create Comments ─────────────────────────────────────────────────
    const commentTexts = [
      "This is so relatable!",
      "Thank you for sharing this.",
      "I went through something similar.",
      "You're not alone in this.",
      "Sending virtual support!",
      "This made my day better.",
      "Appreciate the honesty here.",
      "I needed to read this today.",
      "Brave of you to share.",
      "This community is amazing.",
      "Keep being you!",
      "So true, can't agree more.",
      "This gives me hope.",
      "You put into words what I couldn't.",
      "Respect for putting this out there.",
      "This is why I love this app.",
      "Powerful stuff, thank you.",
      "Had to double-take, thought I wrote this.",
      "Reading this from my couch and nodding.",
      "Sending good vibes your way.",
    ];

    for (let i = 0; i < COMMENTS_COUNT; i++) {
      const confessionId = confessionIds[i % confessionIds.length];
      await manager.query(
        `INSERT INTO "comments" (content, "anonymous_user_id", "confessionId", "createdAt", "isDeleted")
         VALUES ($1, $2, $3, NOW(), false)`,
        [
          commentTexts[i % commentTexts.length],
          anonUserIds[(i + 1) % anonUserIds.length],
          confessionId,
        ],
      );
    }
    console.log(`Created ${COMMENTS_COUNT} comments.`);

    // ── 7. Create Reports ──────────────────────────────────────────────────
    const reportReasons = [
      "This post contains offensive language.",
      "Appears to be spam / promotional content.",
      "Inappropriate content for this platform.",
    ];

    for (let i = 0; i < REPORTS_COUNT; i++) {
      const reportId = crypto.randomUUID();
      const confessionId = confessionIds[(i * 5) % confessionIds.length];
      const reportTypes = ["spam", "harassment", "inappropriate_content"];
      const idempotencyKey = `seed_report_${reportId.substring(0, 8)}`;

      await manager.query(
        `INSERT INTO "reports"
         (id, confession_id, type, reason, status, "createdAt", idempotency_key)
         VALUES ($1, $2, $3, $4, 'pending', NOW(), $5)`,
        [
          reportId,
          confessionId,
          reportTypes[i % reportTypes.length],
          reportReasons[i % reportReasons.length],
          idempotencyKey,
        ],
      );
    }
    console.log(`Created ${REPORTS_COUNT} reports.`);

    // ── 8. Create Pending Notification ─────────────────────────────────────
    const notifId = crypto.randomUUID();
    await manager.query(
      `INSERT INTO "notifications"
       (id, type, "userId", title, message, metadata, "isRead", "isEmailSent", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, false, false, NOW(), NOW())`,
      [
        notifId,
        "system",
        userIds[0].toString(),
        "Welcome to xConfess",
        "Your demo seed data has been loaded. Explore the platform!",
        JSON.stringify({ seed: true }),
      ],
    );
    console.log("Created 1 pending notification.");

    await queryRunner.commitTransaction();
    console.log("\nSeed completed successfully.");
    printSeedCredentials();
  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error("Seed failed:", error);
    process.exit(1);
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
}

function printSeedCredentials() {
  console.log("\nDemo accounts");
  console.log("Password for all seed users: password123");
  console.log("Admin: seed_admin@example.com / seed_admin");
  console.log("User:  seed_alice@example.com / seed_alice");
  console.log("User:  seed_bob@example.com / seed_bob");
  console.log("User:  seed_charlie@example.com / seed_charlie");
  console.log("User:  seed_diana@example.com / seed_diana");
}

seed();
