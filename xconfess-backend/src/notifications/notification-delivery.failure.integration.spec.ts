import { randomUUID } from 'node:crypto';
import { createServer, Socket } from 'node:net';
import { ConfigService } from '@nestjs/config';
import { Queue, QueueEvents, Worker, Job } from 'bullmq';
import { DataSource } from 'typeorm';
import nodemailer from 'nodemailer';
import {
  NotificationProcessor,
  NotificationJobData,
  NOTIFICATION_JOB_OPTIONS,
} from './processors/notification.processor';
import { NotificationService } from './services/notification.service';
import { EmailNotificationService } from './services/email-notification.service';
import { Notification, NotificationType } from './entities/notification.entity';
import { NotificationPreference } from './entities/notification-preference.entity';
import { User } from '../user/entities/user.entity';
import { RequestContextStorage } from '../common/request-context';
import {
  createReliabilityDatabase,
  destroyReliabilityDatabase,
  createTestUser,
} from '../../test/utils/reliability-postgres';
import { eventually } from '../../test/utils/tcp-fault-proxy';

const enabled =
  (process.env.PG_INTEGRATION === 'true' &&
    process.env.REDIS_INTEGRATION === 'true') ||
  (process.env.CI === 'true' && process.env.DB_HOST && process.env.REDIS_HOST);
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration(
  'notification delivery failure injection with PostgreSQL and BullMQ (#2355)',
  () => {
    let ds: DataSource;
    let user: User;
    let queue: Queue<NotificationJobData>;
    let dlq: Queue<NotificationJobData>;
    let events: QueueEvents;
    let worker: Worker<NotificationJobData>;
    let service: NotificationService;
    let sendMail: jest.Mock;
    let failedCallbacks: Promise<void>[];
    const logger = {
      incrementCounter: jest.fn(),
      observeTimer: jest.fn(),
      warn: jest.fn(),
    };
    const connection = {
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT),
      maxRetriesPerRequest: null,
    };

    beforeAll(async () => {
      ds = await createReliabilityDatabase();
      user = await createTestUser(ds);
      await ds.getRepository(NotificationPreference).save({
        userId: String(user.id),
        emailAddress: 'synthetic@example.invalid',
      });
    }, 30000);

    beforeEach(async () => {
      failedCallbacks = [];
      const name = `test-notifications-${randomUUID()}`;
      queue = new Queue(name, {
        connection,
        defaultJobOptions: {
          ...NOTIFICATION_JOB_OPTIONS,
          // Exercise the production attempt budget while shortening only the delay.
          backoff: { type: 'exponential', delay: 10 },
        },
      });
      dlq = new Queue(`${name}-dlq`, { connection });
      events = new QueueEvents(name, { connection });
      await events.waitUntilReady();
      sendMail = jest
        .fn()
        .mockResolvedValue({ messageId: 'synthetic-provider-id' });
      jest
        .spyOn(nodemailer, 'createTransport')
        .mockReturnValue({ sendMail } as any);
      const email = new EmailNotificationService(
        new ConfigService({ SMTP_FROM_EMAIL: 'test@example.invalid' }),
        ds.getRepository(NotificationPreference),
      );
      const processor = new NotificationProcessor(
        email,
        dlq,
        queue,
        logger as any,
      );
      worker = new Worker(
        name,
        (job: Job<NotificationJobData>) => processor.process(job),
        { connection, concurrency: 4 },
      );
      worker.on('failed', (job, error) => {
        failedCallbacks.push(processor.onFailed(job, error));
      });
      await worker.waitUntilReady();
      service = new NotificationService(
        ds.getRepository(Notification),
        ds.getRepository(NotificationPreference),
        ds.getRepository(User),
        queue,
        logger as any,
        new ConfigService({ ENABLE_BACKGROUND_JOBS: 'true' }),
        new RequestContextStorage(),
      );
    });

    afterEach(async () => {
      await worker?.close();
      await Promise.all(failedCallbacks);
      await events?.close();
      if (queue) {
        await queue.obliterate({ force: true });
        await queue.close();
      }
      if (dlq) {
        await dlq.obliterate({ force: true });
        await dlq.close();
      }
      jest.restoreAllMocks();
    });
    afterAll(() => destroyReliabilityDatabase(ds));

    const dto = () => ({
      userId: String(user.id),
      type: NotificationType.NEW_MESSAGE,
      title: 'Synthetic notification',
      message: 'Synthetic private preview',
      idempotencyKey: randomUUID(),
    });
    it('times out a real SMTP server that accepts TCP but never sends a greeting', async () => {
      jest.restoreAllMocks();
      const sockets = new Set<Socket>();
      const smtp = createServer((socket) => sockets.add(socket));
      await new Promise<void>((resolve) =>
        smtp.listen(0, '127.0.0.1', resolve),
      );
      const email = new EmailNotificationService(
        new ConfigService({
          SMTP_HOST: '127.0.0.1',
          SMTP_PORT: (smtp.address() as { port: number }).port,
        }),
        ds.getRepository(NotificationPreference),
      );
      const start = Date.now();
      try {
        await expect(email.sendEmail(dto())).rejects.toMatchObject({
          message: 'Email delivery failed',
          code: 'ETIMEDOUT',
        });
        expect(Date.now() - start).toBeLessThan(7500);
      } finally {
        for (const socket of sockets) socket.destroy();
        await new Promise<void>((resolve) => smtp.close(() => resolve()));
      }
    }, 10000);
    const waitForNotification = async (id: string) => {
      const job = await queue.getJob(`email-${id}`);
      expect(job).not.toBeNull();
      return job!.waitUntilFinished(events, 10000);
    };

    it('retries a provider timeout then delivers once without duplicating the persisted notification', async () => {
      sendMail.mockImplementationOnce(
        () =>
          new Promise((_, reject) =>
            setTimeout(
              () =>
                reject(
                  Object.assign(new Error('provider timeout'), {
                    code: 'ETIMEDOUT',
                  }),
                ),
              30,
            ),
          ),
      );
      const input = dto();
      const notification = (await service.createNotification(input))!;
      await waitForNotification(notification.id);
      expect(sendMail).toHaveBeenCalledTimes(2);
      expect(
        await ds
          .getRepository(Notification)
          .count({ where: { sourceKey: notification.sourceKey! } }),
      ).toBe(1);
      expect((await service.createNotification(input))?.id).toBe(
        notification.id,
      );
      expect(sendMail).toHaveBeenCalledTimes(2);
      expect(await dlq.getJobCounts('waiting', 'failed')).toEqual(
        expect.objectContaining({ waiting: 0, failed: 0 }),
      );
    });

    it('bounds permanent provider rejection at the configured attempt limit and records one safe dead letter', async () => {
      const privateError =
        'SMTP password=synthetic-secret private@example.invalid Synthetic private preview';
      sendMail.mockRejectedValue(
        Object.assign(new Error(privateError), { code: 'EENVELOPE' }),
      );
      const notification = (await service.createNotification(dto()))!;
      await expect(waitForNotification(notification.id)).rejects.toThrow(
        'Email delivery failed',
      );
      await eventually(async () => expect(await dlq.getWaitingCount()).toBe(1));
      await Promise.all(failedCallbacks);
      expect(sendMail).toHaveBeenCalledTimes(
        NOTIFICATION_JOB_OPTIONS.attempts!,
      );
      const [letter] = await dlq.getWaiting();
      expect(letter.data._meta?.attemptsMade).toBe(
        NOTIFICATION_JOB_OPTIONS.attempts,
      );
      expect(letter.data._meta?.lastError).toBe('EENVELOPE');
      expect(JSON.stringify(letter.data._meta)).not.toContain(
        'synthetic-secret',
      );
      expect(JSON.stringify(letter.data._meta)).not.toContain(
        'private@example.invalid',
      );
      const failed = await queue.getJob(`email-${notification.id}`);
      expect(failed?.failedReason).not.toContain(privateError);
      expect(
        await ds
          .getRepository(Notification)
          .count({ where: { sourceKey: notification.sourceKey! } }),
      ).toBe(1);
    });

    it('recovers an enqueue failure after the database commit and still creates only one row and delivery', async () => {
      const add = jest
        .spyOn(queue, 'add')
        .mockRejectedValueOnce(new Error('injected Redis enqueue rejection'));
      const input = dto();
      await expect(service.createNotification(input)).rejects.toThrow(
        'injected Redis enqueue rejection',
      );
      const sourceKey = `${input.userId}:${input.type}:${input.idempotencyKey}`;
      const persisted = await ds
        .getRepository(Notification)
        .findOneByOrFail({ sourceKey });
      expect(sendMail).not.toHaveBeenCalled();
      add.mockRestore();
      const replay = (await service.createNotification(input))!;
      expect(replay.id).toBe(persisted.id);
      await waitForNotification(replay.id);
      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(
        await ds.getRepository(Notification).count({ where: { sourceKey } }),
      ).toBe(1);
    });

    it('deduplicates parallel event retries across the database and the queue', async () => {
      const input = dto();
      const notifications = await Promise.all(
        Array.from({ length: 12 }, () => service.createNotification(input)),
      );
      expect(
        new Set(notifications.map((notification) => notification?.id)).size,
      ).toBe(1);
      await waitForNotification(notifications[0]!.id);
      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(
        await ds
          .getRepository(Notification)
          .count({ where: { sourceKey: notifications[0]!.sourceKey! } }),
      ).toBe(1);
    });
  },
);
