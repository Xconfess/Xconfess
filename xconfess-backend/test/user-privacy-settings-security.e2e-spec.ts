import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../src/user/entities/user.entity';
import { UserController } from '../src/user/user.controller';
import { UserService } from '../src/user/user.service';
import { AuthService } from '../src/auth/auth.service';
import { JwtModule } from '@nestjs/jwt';
import { CryptoUtil } from '../src/common/crypto.util';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';

describe('User Privacy Settings Security (e2e)', () => {
  let app: INestApplication;
  let userService: UserService;
  let authService: AuthService;
  let userRepository: Repository<User>;
  let jwtToken: string;

  const emailPlain = 'test@example.com';
  const emailEnc = CryptoUtil.encrypt(emailPlain);

  const mockUser: User = {
    id: 1,
    username: 'testuser',
    emailEncrypted: emailEnc.encrypted,
    emailIv: emailEnc.iv,
    emailTag: emailEnc.tag,
    emailHash: CryptoUtil.hash(emailPlain),
    password: 'hashedpassword',
    resetPasswordToken: null,
    resetPasswordExpires: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    is_active: true,
    privacySettings: {
      isDiscoverable: true,
      canReceiveReplies: true,
      showReactions: true,
      dataProcessingConsent: true,
    },
  } as unknown as User;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: 'test-secret',
          signOptions: { expiresIn: '1h' },
        }),
      ],
      controllers: [UserController],
      providers: [
        UserService,
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
            merge: jest.fn(),
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Use strict validation for these tests to catch unknown fields
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    userService = moduleFixture.get<UserService>(UserService);
    authService = moduleFixture.get<AuthService>(AuthService);
    userRepository = moduleFixture.get<Repository<User>>(
      getRepositoryToken(User),
    );

    // Mock JWT token generation
    jwtToken = 'valid-jwt-token';
    jest.spyOn(authService, 'validateToken').mockResolvedValue(mockUser);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /users/privacy-settings', () => {
    it('should return 401 when no JWT token is provided', () => {
      return request(app.getHttpServer())
        .get('/users/privacy-settings')
        .expect(401);
    });

    it('should return 401 when invalid JWT token is provided', () => {
      return request(app.getHttpServer())
        .get('/users/privacy-settings')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('should return privacy settings when valid JWT token is provided', async () => {
      const expected = {
        isDiscoverable: true,
        canReceiveReplies: true,
        showReactions: true,
        dataProcessingConsent: true,
      };

      jest.spyOn(userService, 'getPrivacySettings').mockResolvedValue(expected);

      return request(app.getHttpServer())
        .get('/users/privacy-settings')
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual(expected);
        });
    });

    it('should return 404 when user is not found', async () => {
      jest
        .spyOn(userService, 'getPrivacySettings')
        .mockRejectedValue(new NotFoundException('User not found'));

      return request(app.getHttpServer())
        .get('/users/privacy-settings')
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(404);
    });
  });

  describe('PATCH /users/privacy-settings', () => {
    const validUpdate = { isDiscoverable: false, showReactions: false };

    it('should return 401 when no JWT token is provided', () => {
      return request(app.getHttpServer())
        .patch('/users/privacy-settings')
        .send(validUpdate)
        .expect(401);
    });

    it('should return 401 when invalid JWT token is provided', () => {
      return request(app.getHttpServer())
        .patch('/users/privacy-settings')
        .set('Authorization', 'Bearer invalid-token')
        .send(validUpdate)
        .expect(401);
    });

    it('should update privacy settings when valid JWT token is provided', async () => {
      const expected = {
        isDiscoverable: false,
        canReceiveReplies: true,
        showReactions: false,
        dataProcessingConsent: true,
      };

      jest
        .spyOn(userService, 'updatePrivacySettings')
        .mockResolvedValue(expected);

      return request(app.getHttpServer())
        .patch('/users/privacy-settings')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send(validUpdate)
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual(expected);
        });
    });

    it('should return 400 for invalid setting types', async () => {
      const invalid = { isDiscoverable: 'not-a-boolean' };

      return request(app.getHttpServer())
        .patch('/users/privacy-settings')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send(invalid)
        .expect(400);
    });

    it('should return 400 for unknown setting keys', async () => {
      const unknown = { unexpectedKey: true };

      return request(app.getHttpServer())
        .patch('/users/privacy-settings')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send(unknown)
        .expect(400);
    });
  });
});
