import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as nodemailer from 'nodemailer';
import { EmailNotificationService } from './email-notification.service';
import { NotificationPreference } from '../entities/notification-preference.entity';
import { NotificationType } from '../entities/notification.entity';
import { NotificationJobData } from '../notification.queue';

jest.mock('nodemailer');

describe('EmailNotificationService', () => {
  let service: EmailNotificationService;
  let configService: ConfigService;
  let mockPreferenceRepository: any;
  let mockTransporter: any;

  beforeEach(async () => {
    mockTransporter = {
      sendMail: jest.fn().mockResolvedValue(true),
    };

    (nodemailer.createTransport as jest.Mock).mockReturnValue(mockTransporter);

    mockPreferenceRepository = {
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailNotificationService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                SMTP_HOST: 'smtp.test.com',
                SMTP_PORT: 587,
                SMTP_SECURE: 'false',
                SMTP_USER: 'test_user',
                SMTP_PASS: 'test_pass',
                SMTP_FROM_EMAIL: 'noreply@test.com',
                APP_URL: 'http://localhost:3000',
              };
              return config[key as keyof typeof config];
            }),
          },
        },
        {
          provide: getRepositoryToken(NotificationPreference),
          useValue: mockPreferenceRepository,
        },
      ],
    }).compile();

    service = module.get<EmailNotificationService>(EmailNotificationService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendEmail via JobData', () => {
    const jobData: NotificationJobData = {
      userId: 'user-id-123',
      type: NotificationType.NEW_MESSAGE,
      title: 'New message',
      message: 'You got a new message',
    };

    const basePreference = {
      userId: 'user-id-123',
      enableEmailNotifications: true,
      emailAddress: 'test@example.com',
      emailNewMessage: true,
      emailMessageBatch: true,
    };

    it('should not send email if preferences not found', async () => {
      mockPreferenceRepository.findOne.mockResolvedValue(null);

      await service.sendEmail(jobData);

      expect(mockTransporter.sendMail).not.toHaveBeenCalled();
    });

    it('should not send email if email notifications are disabled globally', async () => {
      mockPreferenceRepository.findOne.mockResolvedValue({
        ...basePreference,
        enableEmailNotifications: false,
      });

      await service.sendEmail(jobData);

      expect(mockTransporter.sendMail).not.toHaveBeenCalled();
    });

    it('should not send email if user has no email address', async () => {
      mockPreferenceRepository.findOne.mockResolvedValue({
        ...basePreference,
        emailAddress: null,
      });

      await service.sendEmail(jobData);

      expect(mockTransporter.sendMail).not.toHaveBeenCalled();
    });

    it('should not send email if NEW_MESSAGE is disabled', async () => {
      mockPreferenceRepository.findOne.mockResolvedValue({
        ...basePreference,
        emailNewMessage: false,
      });

      await service.sendEmail(jobData);

      expect(mockTransporter.sendMail).not.toHaveBeenCalled();
    });

    it('should not send email if MESSAGE_BATCH is disabled', async () => {
      mockPreferenceRepository.findOne.mockResolvedValue({
        ...basePreference,
        emailMessageBatch: false,
      });

      await service.sendEmail({
        ...jobData,
        type: NotificationType.MESSAGE_BATCH,
      });

      expect(mockTransporter.sendMail).not.toHaveBeenCalled();
    });

    it('should send a new message email with correct template', async () => {
      mockPreferenceRepository.findOne.mockResolvedValue(basePreference);

      await service.sendEmail(jobData);

      expect(mockTransporter.sendMail).toHaveBeenCalledTimes(1);
      const mailOptions = mockTransporter.sendMail.mock.calls[0][0];

      expect(mailOptions.to).toBe('test@example.com');
      expect(mailOptions.subject).toBe('New Message on xConfess');
      expect(mailOptions.html).toContain(
        "You've received a new anonymous message",
      );
      expect(mailOptions.html).toContain('You got a new message');
    });

    it('should send a message batch email with correct template', async () => {
      mockPreferenceRepository.findOne.mockResolvedValue(basePreference);

      await service.sendEmail({
        ...jobData,
        type: NotificationType.MESSAGE_BATCH,
        metadata: { messageCount: 5 },
      });

      expect(mockTransporter.sendMail).toHaveBeenCalledTimes(1);
      const mailOptions = mockTransporter.sendMail.mock.calls[0][0];

      expect(mailOptions.subject).toBe('5 New Messages on xConfess');
      expect(mailOptions.html).toContain("You've received multiple messages");
      expect(mailOptions.html).toContain('5');
    });

    it('should send a generic system email with correct template', async () => {
      mockPreferenceRepository.findOne.mockResolvedValue(basePreference);

      await service.sendEmail({
        ...jobData,
        type: NotificationType.SYSTEM,
        title: 'System Alert',
        message: 'Scheduled maintenance soon.',
      });

      expect(mockTransporter.sendMail).toHaveBeenCalledTimes(1);
      const mailOptions = mockTransporter.sendMail.mock.calls[0][0];

      expect(mailOptions.subject).toBe('System Alert');
      expect(mailOptions.html).toContain('System Alert');
      expect(mailOptions.html).toContain('Scheduled maintenance soon.');
    });

    it('should bubble up generic errors when parsing or sending fails', async () => {
      mockPreferenceRepository.findOne.mockResolvedValue(basePreference);
      mockTransporter.sendMail.mockRejectedValue(new Error('SMTP Error'));

      await expect(service.sendEmail(jobData)).rejects.toThrow('SMTP Error');
    });
  });
});
