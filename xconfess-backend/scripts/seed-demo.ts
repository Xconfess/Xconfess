import 'reflect-metadata';

import { createHash } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { CryptoUtil } from '../src/common/crypto.util';
import { Gender } from '../src/confession/dto/get-confessions.dto';
import { TipVerificationStatus } from '../src/tipping/entities/tip.entity';
import { UserRole } from '../src/user/entities/user.entity';
import { encryptConfession } from '../src/utils/confession-encryption';

const DEMO_PASSWORD = 'Wave5DemoPass!2026';
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
type QueryRow = Record<string, unknown>;
type Records = ReturnType<typeof buildDemoRecords>;

export function stableDemoHex(seed: string): string {
  return createHash('sha256').update(seed).digest('hex');
}

export function stableDemoUuid(seed: string): string {
  const hex = stableDemoHex(seed);
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function buildDemoRecords() {
  // prettier-ignore
  const userRows = [
    ['regular', 'wave5_user', 'wave5-user@example.test', UserRole.USER],
    ['friend', 'wave5_friend', 'wave5-friend@example.test', UserRole.USER],
    ['admin', 'wave5_admin', 'wave5-admin@example.test', UserRole.ADMIN],
  ] as const;
  // prettier-ignore
  const confessionRows = [
    ['launch-checkin', 'regular', 'Wave 5 demo: shipping a calmer launch after a long week.', Gender.OTHER],
    ['team-support', 'friend', 'Wave 5 demo: a teammate helped turn a rough day around.', Gender.FEMALE],
    ['tip-readiness', 'regular', 'Wave 5 demo: validating anonymous tips before the walkthrough.', Gender.MALE],
  ] as const;
  const users = userRows.map(([key, username, email, role]) => ({
    key,
    username,
    email,
    role,
    password: DEMO_PASSWORD,
    anonymousUserId: stableDemoUuid(`anon:${key}`),
  }));
  const confessions = confessionRows.map(
    ([key, ownerKey, message, gender]) => ({
      key,
      ownerKey,
      message,
      gender,
      id: stableDemoUuid(`confession:${key}`),
      idempotencyKey: `wave5-demo-confession-${key}`,
    }),
  );

  return {
    users,
    confessions,
    // prettier-ignore
    reactions: [
      ['friend', 'launch-checkin', 'like'],
      ['admin', 'launch-checkin', 'heart'],
      ['regular', 'team-support', 'support'],
    ].map(([actorKey, confessionKey, emoji]) => ({
      actorKey, confessionKey, emoji, id: stableDemoUuid(`reaction:${actorKey}:${confessionKey}:${emoji}`),
    })),
    // prettier-ignore
    comments: [
      ['launch-support', 'friend', 'launch-checkin', 'Rooting for this launch. The checklist looks solid.'],
      ['team-thanks', 'regular', 'team-support', 'This is exactly the kind of support worth calling out.'],
      ['launch-admin-reply', 'admin', 'launch-checkin', 'Admin demo reply for nested comment moderation checks.', 'launch-support'],
    ].map(([key, actorKey, confessionKey, content, parentKey]) => ({
      key, actorKey, confessionKey, content, parentKey,
    })),
    // prettier-ignore
    tips: [
      ['launch-checkin', 'tip-1', 1.25, TipVerificationStatus.VERIFIED],
      ['tip-readiness', 'tip-2', 2.5, TipVerificationStatus.PENDING],
    ].map(([confessionKey, key, amount, status]) => ({
      confessionKey, key, amount, status, id: stableDemoUuid(`tip:${key}`),
      txId: stableDemoHex(`xconfess-wave5-demo-${key}`), idempotencyKey: `xconfess-wave5-demo-${key}`,
    })),
  };
}

function createReport(): SeedReport {
  return Object.fromEntries(
    BUCKETS.map((bucket) => [bucket, { created: 0, updated: 0, skipped: 0 }]),
  ) as SeedReport;
}

function mark(report: SeedReport, bucket: Bucket, action: Action): void {
  report[bucket][action] += 1;
}

function confessionAesKey(): string {
  const key = process.env.CONFESSION_AES_KEY;
  if (!key || key.length !== 32) {
    throw new Error(
      'CONFESSION_AES_KEY must be set to the 32-character local confession AES key before seeding.',
    );
  }
  return key;
}

async function one(
  dataSource: DataSource,
  sql: string,
  params: unknown[] = [],
): Promise<QueryRow | undefined> {
  const rows = (await dataSource.query(sql, params)) as QueryRow[];
  return rows[0];
}

async function upsertUsers(
  dataSource: DataSource,
  records: Records,
  report: SeedReport,
) {
  const userIds = new Map<string, number>();

  for (const user of records.users) {
    const email = user.email.toLowerCase();
    const emailHash = CryptoUtil.hash(email);
    const usernameConflict = await one(
      dataSource,
      'select id from "user" where username = $1 and email_hash <> $2',
      [user.username, emailHash],
    );
    if (usernameConflict)
      throw new Error(
        `Demo username ${user.username} is already used by another local account.`,
      );

    const encryptedEmail = CryptoUtil.encrypt(email);
    const row = await one(
      dataSource,
      `insert into "user" (
        username, password, email_encrypted, email_iv, email_tag, email_hash, role,
        is_active, notification_preferences, privacy_settings, "createdAt", "updatedAt"
      ) values ($1, $2, $3, $4, $5, $6, $7, true, '{}'::jsonb, $8::jsonb, now(), now())
      on conflict (email_hash) do update set
        username = excluded.username,
        password = excluded.password,
        email_encrypted = excluded.email_encrypted,
        email_iv = excluded.email_iv,
        email_tag = excluded.email_tag,
        role = excluded.role,
        is_active = true,
        notification_preferences = excluded.notification_preferences,
        privacy_settings = excluded.privacy_settings,
        "updatedAt" = now()
      returning id, (xmax = 0) as inserted`,
      [
        user.username,
        await bcrypt.hash(user.password, 10),
        encryptedEmail.encrypted,
        encryptedEmail.iv,
        encryptedEmail.tag,
        emailHash,
        user.role,
        JSON.stringify({
          isDiscoverable: true,
          canReceiveReplies: true,
          showReactions: true,
          dataProcessingConsent: true,
        }),
      ],
    );

    userIds.set(user.key, Number(row?.id));
    mark(report, 'users', row?.inserted ? 'created' : 'updated');
  }

  return userIds;
}

async function seedAnonymousUsers(
  dataSource: DataSource,
  records: Records,
  userIds: Map<string, number>,
  report: SeedReport,
) {
  const anonymousIds = new Map<string, string>();

  for (const user of records.users) {
    await dataSource.query(
      'insert into anonymous_user (id, "createdAt") values ($1, now()) on conflict (id) do nothing',
      [user.anonymousUserId],
    );
    const linkId = stableDemoUuid(`link:${user.key}`);
    const rows = (await dataSource.query(
      `insert into user_anonymous_users (id, user_id, anonymous_user_id, "createdAt")
       values ($1, $2, $3, now()) on conflict (id) do nothing returning id`,
      [linkId, userIds.get(user.key), user.anonymousUserId],
    )) as QueryRow[];

    anonymousIds.set(user.key, user.anonymousUserId);
    mark(report, 'anonymousUsers', rows.length ? 'created' : 'skipped');
  }

  return anonymousIds;
}

async function seedConfessions(
  dataSource: DataSource,
  records: Records,
  anonymousIds: Map<string, string>,
  report: SeedReport,
) {
  const confessions = new Map<string, string>();
  const key = confessionAesKey();

  for (const confession of records.confessions) {
    const row = await one(
      dataSource,
      `insert into anonymous_confessions (
        id, message, gender, anonymous_user_id, view_count, "isDeleted", deleted_at,
        deleted_by, moderation_score, moderation_flags, moderation_status,
        requires_review, is_hidden, moderation_details, idempotency_key, created_at
      ) values ($1, $2, $3, $4, 0, false, null, null, 0, '', 'approved', false, false, '{}'::json, $5, now())
      on conflict (idempotency_key) do update set
        message = excluded.message,
        gender = excluded.gender,
        anonymous_user_id = excluded.anonymous_user_id,
        "isDeleted" = false,
        deleted_at = null,
        deleted_by = null,
        moderation_score = 0,
        moderation_flags = '',
        moderation_status = 'approved',
        requires_review = false,
        is_hidden = false,
        moderation_details = '{}'::json
      returning id, (xmax = 0) as inserted`,
      [
        confession.id,
        encryptConfession(confession.message, key),
        confession.gender,
        anonymousIds.get(confession.ownerKey),
        confession.idempotencyKey,
      ],
    );

    confessions.set(confession.key, String(row?.id));
    mark(report, 'confessions', row?.inserted ? 'created' : 'updated');
  }

  return confessions;
}

async function seedReactions(
  dataSource: DataSource,
  records: Records,
  anonymousIds: Map<string, string>,
  confessionIds: Map<string, string>,
  report: SeedReport,
) {
  for (const reaction of records.reactions) {
    const rows = (await dataSource.query(
      `insert into reaction (id, emoji, confession_id, anonymous_user_id, created_at)
       values ($1, $2, $3, $4, now()) on conflict (id) do nothing returning id`,
      [
        reaction.id,
        reaction.emoji,
        confessionIds.get(reaction.confessionKey),
        anonymousIds.get(reaction.actorKey),
      ],
    )) as QueryRow[];
    mark(report, 'reactions', rows.length ? 'created' : 'skipped');
  }
}

async function seedComments(
  dataSource: DataSource,
  records: Records,
  anonymousIds: Map<string, string>,
  confessionIds: Map<string, string>,
  report: SeedReport,
) {
  const commentIds = new Map<string, number>();

  for (const comment of records.comments) {
    const parentId = comment.parentKey
      ? commentIds.get(comment.parentKey)
      : null;
    const existing = await one(
      dataSource,
      `select id from comments where content = $1 and "confessionId" = $2 and anonymous_user_id = $3
       and (($4::int is null and parent_id is null) or parent_id = $4::int)`,
      [
        comment.content,
        confessionIds.get(comment.confessionKey),
        anonymousIds.get(comment.actorKey),
        parentId,
      ],
    );

    if (existing) {
      commentIds.set(comment.key, Number(existing.id));
      mark(report, 'comments', 'skipped');
      continue;
    }

    const row = await one(
      dataSource,
      `insert into comments (content, "createdAt", anonymous_user_id, "confessionId", "anonymousContextId", parent_id, "isDeleted")
       values ($1, now(), $2, $3, $4, $5, false) returning id`,
      [
        comment.content,
        anonymousIds.get(comment.actorKey),
        confessionIds.get(comment.confessionKey),
        anonymousIds.get(comment.actorKey),
        parentId,
      ],
    );
    commentIds.set(comment.key, Number(row?.id));
    mark(report, 'comments', 'created');
  }
}

async function seedTips(
  dataSource: DataSource,
  records: Records,
  confessionIds: Map<string, string>,
  report: SeedReport,
) {
  for (const tip of records.tips) {
    const verifiedAt =
      tip.status === TipVerificationStatus.VERIFIED ? 'now()' : 'null';
    const row = await one(
      dataSource,
      `insert into tips (
        id, confession_id, amount, tx_id, idempotency_key, sender_address,
        verification_status, verified_at, rejection_reason, retry_count,
        last_chain_status, last_checked_at, reconciliation_metadata, created_at
      ) values ($1, $2, $3, $4, $5, null, $6, ${verifiedAt}, null, 0, $6, ${verifiedAt}, '{"source":"local-demo-seed"}'::jsonb, now())
      on conflict (tx_id) do update set
        confession_id = excluded.confession_id,
        amount = excluded.amount,
        idempotency_key = excluded.idempotency_key,
        verification_status = excluded.verification_status,
        verified_at = excluded.verified_at,
        rejection_reason = null,
        retry_count = 0,
        last_chain_status = excluded.last_chain_status,
        last_checked_at = excluded.last_checked_at,
        reconciliation_metadata = excluded.reconciliation_metadata
      returning (xmax = 0) as inserted`,
      [
        tip.id,
        confessionIds.get(String(tip.confessionKey)),
        tip.amount,
        tip.txId,
        tip.idempotencyKey,
        tip.status,
      ],
    );
    mark(report, 'tips', row?.inserted ? 'created' : 'updated');
  }
}

export async function seedDemoRecords(
  dataSource: DataSource,
  records = buildDemoRecords(),
): Promise<SeedReport> {
  const report = createReport();
  const userIds = await upsertUsers(dataSource, records, report);
  const anonymousIds = await seedAnonymousUsers(
    dataSource,
    records,
    userIds,
    report,
  );
  const confessionIds = await seedConfessions(
    dataSource,
    records,
    anonymousIds,
    report,
  );

  await seedReactions(dataSource, records, anonymousIds, confessionIds, report);
  await seedComments(dataSource, records, anonymousIds, confessionIds, report);
  await seedTips(dataSource, records, confessionIds, report);

  return report;
}

function printReport(report: SeedReport): void {
  console.log('Seeded Wave 5 local demo data.');
  for (const bucket of BUCKETS) {
    const value = report[bucket];
    console.log(
      `- ${bucket}: created ${value.created}, updated ${value.updated}, skipped ${value.skipped}`,
    );
  }
  console.log(
    `\nDemo credentials:\n- wave5_user / ${DEMO_PASSWORD}\n- wave5_friend / ${DEMO_PASSWORD}\n- wave5_admin / ${DEMO_PASSWORD}`,
  );
}

async function main(): Promise<void> {
  const module = await import('../data-source');
  const dataSource = module.default;
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
    console.error(`Failed to seed Wave 5 demo data: ${message}`);
    process.exitCode = 1;
  });
}
