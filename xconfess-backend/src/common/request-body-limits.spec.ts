import {
  Body,
  Controller,
  INestApplication,
  Param,
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
  configureRequestBodyParsing,
} from './request-body-limits';

const confessionService = {
  create: jest.fn((dto: CreateConfessionDto) => ({
    id: 'confession-id',
    ...dto,
  })),
  update: jest.fn((id: string, dto: UpdateConfessionDto) => ({ id, ...dto })),
};

const commentService = {
  create: jest.fn((confessionId: string, body: { content: string }) => ({
    id: 1,
    confessionId,
    content: body.content,
  })),
};

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

@Controller('comments')
class TestCommentController {
  @Post(':confessionId')
  create(
    @Param('confessionId') confessionId: string,
    @Body() body: { content: string },
  ) {
    return commentService.create(confessionId, body);
  }
}

function bodyAtByteSize(
  base: Record<string, unknown>,
  targetBytes: number,
): string {
  const bodyWithEmptyPadding = JSON.stringify({ ...base, padding: '' });
  const paddingBytes = targetBytes - Buffer.byteLength(bodyWithEmptyPadding);

  if (paddingBytes < 0) {
    throw new Error('Base body exceeds requested byte size');
  }

  return JSON.stringify({ ...base, padding: 'x'.repeat(paddingBytes) });
}

describe('request body limits', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TestConfessionController, TestCommentController],
    }).compile();

    app = moduleRef.createNestApplication({ bodyParser: false });
    app.setGlobalPrefix('api');

    const requestIdMiddleware = new RequestIdMiddleware();
    app.use(requestIdMiddleware.use.bind(requestIdMiddleware));
    configureRequestBodyParsing(app);
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects an oversized confession before controller work', async () => {
    const secret = 'CONFESSION_SECRET_SHOULD_NOT_BE_ECHOED';
    const body = bodyAtByteSize(
      { message: 'valid', secret },
      CONFESSION_REQUEST_MAX_BYTES + 1,
    );

    const response = await request(app.getHttpServer())
      .post('/api/confessions')
      .set('Content-Type', 'application/json')
      .send(body);

    expect(response.status).toBe(413);
    expect(response.body).toMatchObject({
      status: 413,
      code: 'REQUEST_TOO_LARGE',
      message: 'Request body exceeds the allowed size',
      path: '/api/confessions',
    });
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body.requestId).not.toBe('unknown');
    expect(JSON.stringify(response.body)).not.toContain(secret);
    expect(confessionService.create).not.toHaveBeenCalled();
  });

  it('applies the confession limit to updates too', async () => {
    const body = bodyAtByteSize(
      { message: 'valid update' },
      CONFESSION_REQUEST_MAX_BYTES + 1,
    );

    const response = await request(app.getHttpServer())
      .put('/api/confessions/confession-id')
      .set('Content-Type', 'application/json')
      .send(body);

    expect(response.status).toBe(413);
    expect(response.body.code).toBe('REQUEST_TOO_LARGE');
    expect(confessionService.update).not.toHaveBeenCalled();
  });

  it('rejects an oversized comment before controller work', async () => {
    const secret = 'COMMENT_SECRET_SHOULD_NOT_BE_ECHOED';
    const body = bodyAtByteSize(
      { content: 'valid', secret },
      COMMENT_REQUEST_MAX_BYTES + 1,
    );

    const response = await request(app.getHttpServer())
      .post('/api/comments/confession-id')
      .set('Content-Type', 'application/json')
      .send(body);

    expect(response.status).toBe(413);
    expect(response.body.code).toBe('REQUEST_TOO_LARGE');
    expect(JSON.stringify(response.body)).not.toContain(secret);
    expect(commentService.create).not.toHaveBeenCalled();
  });

  it('accepts a confession request exactly at the byte limit', async () => {
    const body = bodyAtByteSize(
      { message: 'boundary confession' },
      CONFESSION_REQUEST_MAX_BYTES,
    );

    const response = await request(app.getHttpServer())
      .post('/api/confessions')
      .set('Content-Type', 'application/json')
      .send(body);

    expect(response.status).toBe(201);
    expect(confessionService.create).toHaveBeenCalledWith({
      message: 'boundary confession',
    });
  });

  it('accepts a comment request exactly at the byte limit', async () => {
    const body = bodyAtByteSize(
      { content: 'boundary comment' },
      COMMENT_REQUEST_MAX_BYTES,
    );

    const response = await request(app.getHttpServer())
      .post('/api/comments/confession-id')
      .set('Content-Type', 'application/json')
      .send(body);

    expect(response.status).toBe(201);
    expect(commentService.create).toHaveBeenCalledWith('confession-id', {
      content: 'boundary comment',
      padding: expect.any(String),
    });
  });

  it('keeps a normal valid confession request working', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/confessions')
      .send({ message: 'A normal confession', tags: ['life'] });

    expect(response.status).toBe(201);
    expect(response.body.message).toBe('A normal confession');
  });

  it('keeps a normal valid comment request working', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/comments/confession-id')
      .send({ content: 'A normal comment' });

    expect(response.status).toBe(201);
    expect(response.body.content).toBe('A normal comment');
  });
});
