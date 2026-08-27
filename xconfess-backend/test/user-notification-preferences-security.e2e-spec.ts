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

describe('User Notification Preferences Security (e2e)', () => {
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
    notificationPreferences: { email: true, push: false, sms: true },
  };

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
    app.useGlobalPipes(new ValidationPipe());
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

  describe('GET /users/notification-preferences', () => {
    it('should return 401 when no JWT token is provided', () => {
      return request(app.getHttpServer())
        .get('/users/notification-preferences')
        .expect(401);
    });

    it('should return 401 when invalid JWT token is provided', () => {
      return request(app.getHttpServer())
        .get('/users/notification-preferences')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('should return notification preferences when valid JWT token is provided', async () => {
      jest.spyOn(userService, 'findById').mockResolvedValue(mockUser);

      return request(app.getHttpServer())
        .get('/users/notification-preferences')
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual(mockUser.notificationPreferences);
        });
    });

    it('should return 404 when user is not found', async () => {
      jest.spyOn(userService, 'findById').mockResolvedValue(null);

      return request(app.getHttpServer())
        .get('/users/notification-preferences')
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(404);
    });
  });

  describe('PATCH /users/notification-preferences', () => {
    const updateData = { email: false, push: true };

    it('should return 401 when no JWT token is provided', () => {
      return request(app.getHttpServer())
        .patch('/users/notification-preferences')
        .send(updateData)
        .expect(401);
    });

    it('should return 401 when invalid JWT token is provided', () => {
      return request(app.getHttpServer())
        .patch('/users/notification-preferences')
        .set('Authorization', 'Bearer invalid-token')
        .send(updateData)
        .expect(401);
    });

    it('should update notification preferences when valid JWT token is provided', async () => {
      const updatedUser = {
        ...mockUser,
        notificationPreferences: {
          ...mockUser.notificationPreferences,
          ...updateData,
        },
      };

      jest.spyOn(userService, 'findById').mockResolvedValue(mockUser);
      jest.spyOn(userService, 'saveUser').mockResolvedValue(updatedUser);

      return request(app.getHttpServer())
        .patch('/users/notification-preferences')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send(updateData)
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual(updatedUser.notificationPreferences);
        });
    });

    it('should return 404 when user is not found during update', async () => {
      jest.spyOn(userService, 'findById').mockResolvedValue(null);

      return request(app.getHttpServer())
        .patch('/users/notification-preferences')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send(updateData)
        .expect(404);
    });

    it('should merge preferences correctly', async () => {
      const partialUpdate = { push: true };
      const expectedMerged = { email: true, push: true, sms: true };
      const updatedUser = {
        ...mockUser,
        notificationPreferences: expectedMerged,
      };

      jest.spyOn(userService, 'findById').mockResolvedValue(mockUser);
      jest.spyOn(userService, 'saveUser').mockResolvedValue(updatedUser);

      return request(app.getHttpServer())
        .patch('/users/notification-preferences')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send(partialUpdate)
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual(expectedMerged);
        });
    });
  });
});
