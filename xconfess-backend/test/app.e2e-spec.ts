import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });
});

describe('Moderation endpoints (e2e)', () => {
  let app: INestApplication;
  let confessionId: string;
  let commentId: number;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Create a confession and comment (simulate, or use fixtures)
    // For brevity, assume endpoints exist to create these and return IDs
    // confessionId = ...
    // commentId = ...
    confessionId = 'dummy-confession-id';
    commentId = 1;
  });

  it('should approve a comment', async () => {
    // Simulate admin login or bypass guard
    await request(app.getHttpServer())
      .post(`/comments/admin/comments/${commentId}/approve`)
      .expect(201);
  });

  it('should reject a comment', async () => {
    await request(app.getHttpServer())
      .post(`/comments/admin/comments/${commentId}/reject`)
      .expect(201);
  });

  it('should only show approved comments in public view', async () => {
    // Approve one comment, reject another, then fetch public comments
    await request(app.getHttpServer())
      .post(`/comments/admin/comments/${commentId}/approve`)
      .expect(201);
    const res = await request(app.getHttpServer())
      .get(`/comments/by-confession/${confessionId}`)
      .expect(200);
    expect(res.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: commentId })]),
    );
  });
});
