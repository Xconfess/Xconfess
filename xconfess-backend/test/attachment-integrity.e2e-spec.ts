import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AttachmentController } from '../src/attachment/attachment.controller';
import { AttachmentIntegrityService } from '../src/attachment/attachment-integrity.service';
import { AttachmentRepository } from '../src/attachment/repository/attachment.repository';
import { AttachmentCleanupService } from '../src/attachment/attachment-cleanup.service';
import { AnonymousUserService } from '../src/user/anonymous-user.service';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { AttachmentStatus, AttachmentType } from '../src/attachment/entities/attachment.entity';

/**
 * Integration coverage for issue #2019: attachment metadata consistency
 * checks on GET /attachments/:id. Mirrors the lightweight controller-level
 * e2e style used elsewhere in this repo (see admin-step-up.e2e-spec.ts,
 * core-journey.e2e-spec.ts) rather than booting the full AppModule.
 */
describe('Attachment metadata consistency (e2e) — #2019', () => {
  let app: INestApplication;

  const OWNER_USER_ID = 1;
  const OWNER_ANON_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const OTHER_ANON_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const SECRET_OBJECT_KEY = 'private/objects/should-never-leak.bin';

  const baseAttachment = {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    objectKey: SECRET_OBJECT_KEY,
    originalName: 'photo.png',
    size: '2048', // bigint column -> string, as TypeORM returns it
    mimeType: 'image/png',
    type: AttachmentType.IMAGE,
    status: AttachmentStatus.COMPLETED,
    checksum: null,
    metadata: null,
    anonymousUser: null,
    anonymousUserId: OWNER_ANON_ID,
    confessionId: null,
    messageId: null,
    expiresAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    completedAt: new Date('2026-01-01T00:05:00Z'),
    failedAt: null,
    failureReason: null,
  };

  const mockAttachmentRepository = {
    findById: jest.fn(),
  };

  const mockAnonymousUserService = {
    getAnonIdsForUser: jest.fn(),
  };

  const mockCleanupService = {};

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AttachmentController],
      providers: [
        AttachmentIntegrityService,
        { provide: AttachmentRepository, useValue: mockAttachmentRepository },
        { provide: AnonymousUserService, useValue: mockAnonymousUserService },
        { provide: AttachmentCleanupService, useValue: mockCleanupService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: any) => {
          const req = context.switchToHttp().getRequest();
          req.user = { id: OWNER_USER_ID, sub: OWNER_USER_ID };
          return true;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 with a sanitized body for the owner', async () => {
    mockAttachmentRepository.findById.mockResolvedValue({ ...baseAttachment });
    mockAnonymousUserService.getAnonIdsForUser.mockResolvedValue([OWNER_ANON_ID]);

    const res = await request(app.getHttpServer())
      .get(`/attachments/${baseAttachment.id}`)
      .expect(200);

    expect(res.body.id).toBe(baseAttachment.id);
    expect(res.body.size).toBe(2048);
    expect(res.body.objectKey).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain(SECRET_OBJECT_KEY);
  });

  it('returns 404 when a different user requests someone else\'s attachment', async () => {
    mockAttachmentRepository.findById.mockResolvedValue({ ...baseAttachment });
    mockAnonymousUserService.getAnonIdsForUser.mockResolvedValue([OTHER_ANON_ID]);

    const res = await request(app.getHttpServer())
      .get(`/attachments/${baseAttachment.id}`)
      .expect(404);

    expect(JSON.stringify(res.body)).not.toContain(SECRET_OBJECT_KEY);
  });

  it('returns 404 for a nonexistent attachment', async () => {
    mockAttachmentRepository.findById.mockResolvedValue(null);
    mockAnonymousUserService.getAnonIdsForUser.mockResolvedValue([OWNER_ANON_ID]);

    await request(app.getHttpServer())
      .get('/attachments/does-not-exist')
      .expect(404);
  });

  it('returns 404 when objectKey is missing on the record', async () => {
    mockAttachmentRepository.findById.mockResolvedValue({ ...baseAttachment, objectKey: null });
    mockAnonymousUserService.getAnonIdsForUser.mockResolvedValue([OWNER_ANON_ID]);

    await request(app.getHttpServer())
      .get(`/attachments/${baseAttachment.id}`)
      .expect(404);
  });

  it('returns 404 when size is missing or zero', async () => {
    mockAttachmentRepository.findById.mockResolvedValue({ ...baseAttachment, size: '0' });
    mockAnonymousUserService.getAnonIdsForUser.mockResolvedValue([OWNER_ANON_ID]);

    await request(app.getHttpServer())
      .get(`/attachments/${baseAttachment.id}`)
      .expect(404);
  });

  it('returns 404 when mimeType is missing', async () => {
    mockAttachmentRepository.findById.mockResolvedValue({ ...baseAttachment, mimeType: null });
    mockAnonymousUserService.getAnonIdsForUser.mockResolvedValue([OWNER_ANON_ID]);

    await request(app.getHttpServer())
      .get(`/attachments/${baseAttachment.id}`)
      .expect(404);
  });

  it('returns 404 when the attachment is still UPLOADING (not servable yet)', async () => {
    mockAttachmentRepository.findById.mockResolvedValue({
      ...baseAttachment,
      status: AttachmentStatus.UPLOADING,
      completedAt: null,
    });
    mockAnonymousUserService.getAnonIdsForUser.mockResolvedValue([OWNER_ANON_ID]);

    await request(app.getHttpServer())
      .get(`/attachments/${baseAttachment.id}`)
      .expect(404);
  });

  it('never includes the real objectKey anywhere in any error response', async () => {
    mockAttachmentRepository.findById.mockResolvedValue({ ...baseAttachment, anonymousUserId: OTHER_ANON_ID });
    mockAnonymousUserService.getAnonIdsForUser.mockResolvedValue([OWNER_ANON_ID]);

    const res = await request(app.getHttpServer()).get(`/attachments/${baseAttachment.id}`);
    expect(JSON.stringify(res.body)).not.toContain(SECRET_OBJECT_KEY);
  });
});
