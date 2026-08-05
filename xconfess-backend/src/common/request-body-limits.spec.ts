import {
  Body,
  Controller,
  INestApplication,
  Param,
  Patch,
  Post,
  Put,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { RequestIdMiddleware } from '../middleware/request-id.middleware';
import { CreateConfessionDto } from '../confession/dto/create-confession.dto';
import { UpdateConfessionDto } from '../confession/dto/update-confession.dto';
import {
  COMMENT_REQUEST_MAX_BYTES,
  CONFESSION_REQUEST_MAX_BYTES,
  DRAFT_REQUEST_MAX_BYTES,
  MESSAGE_REQUEST_MAX_BYTES,
  REPORT_REQUEST_MAX_BYTES,
  configureRequestBodyParsing,
} from './request-body-limits';

// ── Minimal stub services ────────────────────────────────────────────────────

const confessionService = {
  create: jest.fn((dto: CreateConfessionDto) => ({ id: 'confession-id', ...dto })),
  update: jest.fn((id: string, dto: UpdateConfessionDto) => ({ id, ...dto })),
};

const commentService = {
  create: jest.fn((confessionId: string, body: { content: string }) => ({
    id: 1,
    confessionId,
    content: body.content,
  })),
  edit: jest.fn((id: string, body: { content: string }) => ({
    id,
    content: body.content,
  })),
};

const reportService = {
  create: jest.fn((confessionId: string, dto: unknown) => ({ id: 1, confessionId, ...dto })),
};

const draftService = {
  create: jest.fn((dto: unknown) => ({ id: 'draft-id', ...dto })),
  update: jest.fn((id: string, dto: unknown) => ({ id, ...dto })),
};

const messageService = {
  send: jest.fn((dto: unknown) => ({ id: 1, ...dto })),
};

// ── Minimal test controllers ─────────────────────────────────────────────────

@Controller('confessions')
class TestConfessionController {
  @Post()
  create(@Body() dto: CreateConfessionDto) {
    return confessionService.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateConfessionDto) {
    return confessionService.update(id, dto);
  }
}

/** Mirrors real CommentController at confessions/:confessionId/comments */
@Controller('confessions/:confessionId/comments')
class TestCommentController {
  @Post()
  create(
    @Param('confessionId') confessionId: string,
    @Body() body: { content: string },
  ) {
    return commentService.create(confessionId, body);
  }

  @Patch(':id')
  edit(@Param('id') id: string, @Body() body: { content: string }) {
    return commentService.edit(id, body);
  }
}

@Controller('confessions/:id')
class TestReportController {
  @Post('report')
  create(@Param('id') confessionId: string, @Body() dto: unknown) {
    return reportService.create(confessionId, dto);
  }
}

@Controller('confessions/drafts')
class TestDraftController {
  @Post()
  create(@Body() dto: unknown) {
    return draftService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: unknown) {
    return draftService.update(id, dto);
  }
}

@Controller('messages')
class TestMessageController {
  @Post()
  send(@Body() dto: unknown) {
    return messageService.send(dto);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a JSON string whose byte length equals `targetBytes`.
 * A `padding` field is appended to reach the exact target.
 */
function bodyAtByteSize(
  base: Record<string, unknown>,
  targetBytes: number,
): string {
  const bodyWithEmptyPadding = JSON.stringify({ ...base, padding: '' });
  const paddingBytes = targetBytes - Buffer.byteLength(bodyWithEmptyPadding);

  if (paddingBytes < 0) {
    throw new Error(
      `Base body (${Buffer.byteLength(bodyWithEmptyPadding)} B) already exceeds requested ${targetBytes} B`,
    );
  }

  return JSON.stringify({ ...base, padding: 'x'.repeat(paddingBytes) });
}

// ── Test suite ───────────────────────────────────────────────────────────────

describe('request body limits', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [
        TestConfessionController,
        TestCommentController,
        TestReportController,
        TestDraftController,
        TestMessageController,
      ],
    }).compile();

    app = moduleRef.createNestApplication({ bodyParser: false });
    app.setGlobalPrefix('api');

    const requestIdMiddleware = new RequestIdMiddleware();
    app.use(requestIdMiddleware.use.bind(requestIdMiddleware));
    configureRequestBodyParsing(app);
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Confessions ────────────────────────────────────────────────────────────

  describe('confessions', () => {
    it('rejects an oversized POST /confessions body with 413', async () => {
      const secret = 'CONFESSION_SECRET_MUST_NOT_LEAK';
      const body = bodyAtByteSize(
        { message: 'valid', secret },
        CONFESSION_REQUEST_MAX_BYTES + 1,
      );

      const res = await request(app.getHttpServer())
        .post('/api/confessions')
        .set('Content-Type', 'application/json')
        .send(body);

      expect(res.status).toBe(413);
      expect(res.body).toMatchObject({
        status: 413,
        code: 'REQUEST_TOO_LARGE',
        message: 'Request body exceeds the allowed size',
        path: '/api/confessions',
      });
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body.requestId).not.toBe('unknown');
      expect(JSON.stringify(res.body)).not.toContain(secret);
      expect(confessionService.create).not.toHaveBeenCalled();
    });

    it('rejects an oversized PUT /confessions/:id body with 413', async () => {
      const body = bodyAtByteSize(
        { message: 'updated' },
        CONFESSION_REQUEST_MAX_BYTES + 1,
      );

      const res = await request(app.getHttpServer())
        .put('/api/confessions/abc-123')
        .set('Content-Type', 'application/json')
        .send(body);

      expect(res.status).toBe(413);
      expect(res.body.code).toBe('REQUEST_TOO_LARGE');
      expect(confessionService.update).not.toHaveBeenCalled();
    });

    it('accepts a POST /confessions body exactly at the byte limit', async () => {
      const body = bodyAtByteSize(
        { message: 'boundary confession' },
        CONFESSION_REQUEST_MAX_BYTES,
      );

      const res = await request(app.getHttpServer())
        .post('/api/confessions')
        .set('Content-Type', 'application/json')
        .send(body);

      expect(res.status).toBe(201);
      expect(confessionService.create).toHaveBeenCalled();
    });

    it('accepts a normal confession POST', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/confessions')
        .send({ message: 'A normal confession', tags: ['life'] });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('A normal confession');
    });
  });

  // ── Comments ───────────────────────────────────────────────────────────────

  describe('comments', () => {
    it('rejects an oversized POST /confessions/:id/comments body with 413', async () => {
      const secret = 'COMMENT_SECRET_MUST_NOT_LEAK';
      const body = bodyAtByteSize(
        { content: 'valid comment', secret },
        COMMENT_REQUEST_MAX_BYTES + 1,
      );

      const res = await request(app.getHttpServer())
        .post('/api/confessions/conf-123/comments')
        .set('Content-Type', 'application/json')
        .send(body);

      expect(res.status).toBe(413);
      expect(res.body).toMatchObject({
        status: 413,
        code: 'REQUEST_TOO_LARGE',
        message: 'Request body exceeds the allowed size',
        path: '/api/confessions/conf-123/comments',
      });
      expect(JSON.stringify(res.body)).not.toContain(secret);
      expect(commentService.create).not.toHaveBeenCalled();
    });

    it('rejects an oversized PATCH /confessions/:id/comments/:commentId body with 413', async () => {
      const body = bodyAtByteSize(
        { content: 'edited comment' },
        COMMENT_REQUEST_MAX_BYTES + 1,
      );

      const res = await request(app.getHttpServer())
        .patch('/api/confessions/conf-123/comments/42')
        .set('Content-Type', 'application/json')
        .send(body);

      expect(res.status).toBe(413);
      expect(res.body.code).toBe('REQUEST_TOO_LARGE');
      expect(commentService.edit).not.toHaveBeenCalled();
    });

    it('accepts a POST /confessions/:id/comments body exactly at the byte limit', async () => {
      const body = bodyAtByteSize(
        { content: 'boundary comment' },
        COMMENT_REQUEST_MAX_BYTES,
      );

      const res = await request(app.getHttpServer())
        .post('/api/confessions/conf-123/comments')
        .set('Content-Type', 'application/json')
        .send(body);

      expect(res.status).toBe(201);
      expect(commentService.create).toHaveBeenCalled();
    });

    it('accepts a normal comment POST', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/confessions/conf-123/comments')
        .send({ content: 'A normal comment' });

      expect(res.status).toBe(201);
      expect(res.body.content).toBe('A normal comment');
    });
  });

  // ── Reports ────────────────────────────────────────────────────────────────

  describe('reports', () => {
    it('rejects an oversized POST /confessions/:id/report body with 413', async () => {
      const secret = 'REPORT_SECRET_MUST_NOT_LEAK';
      const body = bodyAtByteSize(
        { type: 'spam', reason: 'valid', secret },
        REPORT_REQUEST_MAX_BYTES + 1,
      );

      const res = await request(app.getHttpServer())
        .post('/api/confessions/conf-123/report')
        .set('Content-Type', 'application/json')
        .send(body);

      expect(res.status).toBe(413);
      expect(res.body).toMatchObject({
        status: 413,
        code: 'REQUEST_TOO_LARGE',
        message: 'Request body exceeds the allowed size',
      });
      expect(JSON.stringify(res.body)).not.toContain(secret);
      expect(reportService.create).not.toHaveBeenCalled();
    });

    it('accepts a POST /confessions/:id/report body exactly at the byte limit', async () => {
      const body = bodyAtByteSize(
        { type: 'spam', reason: 'valid reason' },
        REPORT_REQUEST_MAX_BYTES,
      );

      const res = await request(app.getHttpServer())
        .post('/api/confessions/conf-123/report')
        .set('Content-Type', 'application/json')
        .send(body);

      expect(res.status).toBe(201);
      expect(reportService.create).toHaveBeenCalled();
    });

    it('accepts a normal report POST', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/confessions/conf-123/report')
        .send({ type: 'spam', reason: 'This is spam' });

      expect(res.status).toBe(201);
    });
  });

  // ── Confession drafts ──────────────────────────────────────────────────────

  describe('confession drafts', () => {
    it('rejects an oversized POST /confessions/drafts body with 413', async () => {
      const secret = 'DRAFT_SECRET_MUST_NOT_LEAK';
      const body = bodyAtByteSize(
        { content: 'valid draft', secret },
        DRAFT_REQUEST_MAX_BYTES + 1,
      );

      const res = await request(app.getHttpServer())
        .post('/api/confessions/drafts')
        .set('Content-Type', 'application/json')
        .send(body);

      expect(res.status).toBe(413);
      expect(res.body).toMatchObject({
        status: 413,
        code: 'REQUEST_TOO_LARGE',
        message: 'Request body exceeds the allowed size',
      });
      expect(JSON.stringify(res.body)).not.toContain(secret);
      expect(draftService.create).not.toHaveBeenCalled();
    });

    it('rejects an oversized PATCH /confessions/drafts/:id body with 413', async () => {
      const body = bodyAtByteSize(
        { content: 'updated draft' },
        DRAFT_REQUEST_MAX_BYTES + 1,
      );

      const res = await request(app.getHttpServer())
        .patch('/api/confessions/drafts/draft-id')
        .set('Content-Type', 'application/json')
        .send(body);

      expect(res.status).toBe(413);
      expect(res.body.code).toBe('REQUEST_TOO_LARGE');
      expect(draftService.update).not.toHaveBeenCalled();
    });

    it('accepts a POST /confessions/drafts body exactly at the byte limit', async () => {
      const body = bodyAtByteSize(
        { content: 'boundary draft' },
        DRAFT_REQUEST_MAX_BYTES,
      );

      const res = await request(app.getHttpServer())
        .post('/api/confessions/drafts')
        .set('Content-Type', 'application/json')
        .send(body);

      expect(res.status).toBe(201);
      expect(draftService.create).toHaveBeenCalled();
    });

    it('accepts a normal draft POST', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/confessions/drafts')
        .send({ content: 'A normal draft', category: 'general' });

      expect(res.status).toBe(201);
    });
  });

  // ── Messages ───────────────────────────────────────────────────────────────

  describe('messages', () => {
    it('rejects an oversized POST /messages body with 413', async () => {
      const secret = 'MESSAGE_SECRET_MUST_NOT_LEAK';
      const body = bodyAtByteSize(
        { confession_id: 'conf-id', content: 'hi', secret },
        MESSAGE_REQUEST_MAX_BYTES + 1,
      );

      const res = await request(app.getHttpServer())
        .post('/api/messages')
        .set('Content-Type', 'application/json')
        .send(body);

      expect(res.status).toBe(413);
      expect(res.body).toMatchObject({
        status: 413,
        code: 'REQUEST_TOO_LARGE',
        message: 'Request body exceeds the allowed size',
      });
      expect(JSON.stringify(res.body)).not.toContain(secret);
      expect(messageService.send).not.toHaveBeenCalled();
    });

    it('accepts a POST /messages body exactly at the byte limit', async () => {
      const body = bodyAtByteSize(
        { confession_id: 'conf-id', content: 'hello' },
        MESSAGE_REQUEST_MAX_BYTES,
      );

      const res = await request(app.getHttpServer())
        .post('/api/messages')
        .set('Content-Type', 'application/json')
        .send(body);

      expect(res.status).toBe(201);
      expect(messageService.send).toHaveBeenCalled();
    });

    it('accepts a normal message POST', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/messages')
        .send({ confession_id: 'conf-id', content: 'Hello there!' });

      expect(res.status).toBe(201);
    });
  });

  // ── Response shape guarantees ──────────────────────────────────────────────

  describe('413 response shape', () => {
    it('always includes status, code, message, timestamp, path, and requestId', async () => {
      const body = bodyAtByteSize(
        { message: 'valid' },
        CONFESSION_REQUEST_MAX_BYTES + 1,
      );

      const res = await request(app.getHttpServer())
        .post('/api/confessions')
        .set('Content-Type', 'application/json')
        .send(body);

      expect(res.status).toBe(413);
      expect(typeof res.body.timestamp).toBe('string');
      expect(typeof res.body.requestId).toBe('string');
      expect(res.body.requestId).not.toBe('unknown');
      expect(res.body.path).toBe('/api/confessions');
    });

    it('does not reflect raw request body content in the error response', async () => {
      const sensitiveValue = 'SENSITIVE_PAYLOAD_REFLECTION_CHECK';
      const body = bodyAtByteSize(
        { message: sensitiveValue },
        CONFESSION_REQUEST_MAX_BYTES + 1,
      );

      const res = await request(app.getHttpServer())
        .post('/api/confessions')
        .set('Content-Type', 'application/json')
        .send(body);

      expect(res.status).toBe(413);
      expect(JSON.stringify(res.body)).not.toContain(sensitiveValue);
    });
  });
});
