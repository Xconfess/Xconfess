import { DataSource } from 'typeorm';
import { ConflictException } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { Message } from './entities/message.entity';
import { MessageRepository } from './repository/message.repository';
import { AnonymousConfession } from '../confession/entities/confession.entity';
import { AnonymousUser } from '../user/entities/anonymous-user.entity';
import { AnonymousUserService } from '../user/anonymous-user.service';
import { UserAnonymousUser } from '../user/entities/user-anonymous-link.entity';
import { User } from '../user/entities/user.entity';
import { OutboxEvent } from '../common/entities/outbox-event.entity';
import {
  generateMessageKeyPair,
  encryptMessage,
} from './crypto/message-e2e.crypto';
import { AddMessageIdempotencyKey20261022000001 } from '../../migrations/20261022000001-add-message-idempotency-key';
import {
  describePostgres,
  createReliabilityDatabase,
  destroyReliabilityDatabase,
  createTestUser,
} from '../../test/utils/reliability-postgres';

describePostgres('concurrent message sends on PostgreSQL (#2352)', () => {
  let ds: DataSource;
  let service: MessagesService;
  let author: User;
  let sender: User;
  let authorAnon: AnonymousUser;
  let senderAnon: AnonymousUser;
  let confession: AnonymousConfession;
  let content: string;

  beforeAll(async () => {
    ds = await createReliabilityDatabase();
    author = await createTestUser(ds);
    sender = await createTestUser(ds);
    authorAnon = await ds.getRepository(AnonymousUser).save({});
    senderAnon = await ds.getRepository(AnonymousUser).save({});
    await ds.getRepository(UserAnonymousUser).save([
      { userId: author.id, anonymousUserId: authorAnon.id },
      { userId: sender.id, anonymousUserId: senderAnon.id },
    ]);
    confession = await ds
      .getRepository(AnonymousConfession)
      .save({ message: 'synthetic confession', anonymousUser: authorAnon });
    const keys = await generateMessageKeyPair();
    const peer = await generateMessageKeyPair();
    content = await encryptMessage(
      'synthetic private content',
      keys.privateKey,
      peer.publicKey,
      `${confession.id}_${senderAnon.id}`,
    );
    service = new MessagesService(
      ds.getRepository(Message),
      ds.getRepository(AnonymousConfession),
      ds.getRepository(UserAnonymousUser),
      ds.getRepository(OutboxEvent),
      new MessageRepository(ds.getRepository(Message)),
      new AnonymousUserService(
        ds.getRepository(AnonymousUser),
        ds.getRepository(UserAnonymousUser),
      ),
      ds,
    );
  }, 30000);

  beforeEach(async () => {
    await ds.getRepository(OutboxEvent).clear();
    await ds.getRepository(Message).clear();
  });
  afterAll(() => destroyReliabilityDatabase(ds));

  const send = (key?: string, user = sender, ciphertext = content) =>
    service.create(
      { confession_id: confession.id, content: ciphertext },
      user,
      key,
    );

  it('replays 20 parallel requests with a shared key as one message and one outbox event', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => send('shared')),
    );
    expect(new Set(results.map((message) => message.id)).size).toBe(1);
    expect(await ds.getRepository(Message).count()).toBe(1);
    expect(await ds.getRepository(OutboxEvent).count()).toBe(1);
    const [event] = await ds.getRepository(OutboxEvent).find();
    expect(event.payload.messageId).toBe(results[0].id);
    expect(JSON.stringify(event.payload)).not.toContain(content);
    // The committed response survives a later retry.
    expect((await send('shared')).id).toBe(results[0].id);
  });

  it('keeps distinct keys and unkeyed sends without losing messages', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        send(i < 10 ? `key-${i}` : undefined),
      ),
    );
    expect(new Set(results.map((message) => message.id)).size).toBe(20);
    expect(await ds.getRepository(Message).count()).toBe(20);
    expect(await ds.getRepository(OutboxEvent).count()).toBe(20);
    expect(
      new Set(
        (await ds.getRepository(OutboxEvent).find()).map(
          (event) => event.payload.messageId,
        ),
      ),
    ).toEqual(new Set(results.map((message) => message.id)));
    const expected = (
      await ds
        .getRepository(Message)
        .find({ order: { createdAt: 'ASC', id: 'ASC' } })
    ).map((message) => message.id);
    const seen: number[] = [];
    let cursor: string | undefined;
    do {
      const page = await service.findForConfessionThread(
        confession.id,
        senderAnon.id,
        author,
        { limit: 3, cursor },
      );
      seen.push(...page.data.map((message) => message.id));
      cursor = page.nextCursor ?? undefined;
      expect(seen.length).toBeLessThanOrEqual(expected.length);
    } while (cursor);
    expect(seen).toEqual(expected);
  });

  it('rejects conflicting payloads and scopes the same key to each user', async () => {
    await send('per-user');
    await expect(
      send('per-user', sender, content + ' '),
    ).rejects.toBeInstanceOf(ConflictException);
    await send('per-user', author);
    expect(await ds.getRepository(Message).count()).toBe(2);
  });

  it('rolls back the message when notification persistence fails, then permits retry', async () => {
    await ds.query(
      `CREATE FUNCTION reject_test_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected outbox failure'; END $$`,
    );
    await ds.query(
      `CREATE TRIGGER reject_test_outbox BEFORE INSERT ON outbox_events FOR EACH ROW EXECUTE FUNCTION reject_test_outbox()`,
    );
    try {
      await expect(send('rollback')).rejects.toThrow('injected outbox failure');
      expect(await ds.getRepository(Message).count()).toBe(0);
      expect(await ds.getRepository(OutboxEvent).count()).toBe(0);
    } finally {
      await ds.query('DROP TRIGGER reject_test_outbox ON outbox_events');
      await ds.query('DROP FUNCTION reject_test_outbox()');
    }
    await send('rollback');
    expect(await ds.getRepository(Message).count()).toBe(1);
    expect(await ds.getRepository(OutboxEvent).count()).toBe(1);
  });

  it('paginates concurrent sends with tied timestamps in stable id order, without gaps', async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => send(`ordered-${i}`)),
    );
    await ds
      .getRepository(Message)
      .createQueryBuilder()
      .update()
      .set({ createdAt: new Date('2026-01-01T00:00:00Z') })
      .execute();
    const expected = (
      await ds.getRepository(Message).find({ order: { id: 'ASC' } })
    ).map((message) => message.id);
    const otherConfession = await ds
      .getRepository(AnonymousConfession)
      .save({ message: 'other thread', anonymousUser: authorAnon });
    await ds
      .getRepository(Message)
      .save({
        sender: senderAnon,
        confession: otherConfession,
        content,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });
    const seen: number[] = [];
    let cursor: string | undefined;
    do {
      const page = await service.findForConfessionThread(
        confession.id,
        senderAnon.id,
        author,
        { limit: 3, cursor },
      );
      seen.push(...page.data.map((message) => message.id));
      cursor = page.nextCursor ?? undefined;
      expect(seen.length).toBeLessThanOrEqual(expected.length);
    } while (cursor);
    expect(seen).toEqual(expected);
  });

  it('runs the idempotent migration up, down and up against real PostgreSQL', async () => {
    const migration = new AddMessageIdempotencyKey20261022000001();
    const runner = ds.createQueryRunner();
    try {
      await migration.down(runner);
      await migration.up(runner);
      await migration.up(runner);
      const table = await runner.getTable('messages');
      expect(table?.findColumnByName('idempotency_key')?.length).toBe('64');
      expect(
        table?.indices.find(
          (index) => index.name === 'IDX_messages_idempotency_key',
        )?.isUnique,
      ).toBe(true);
    } finally {
      await runner.release();
    }
  });
});
