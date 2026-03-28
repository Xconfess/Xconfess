import { getQueueToken } from '@nestjs/bull';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ExportRequest } from './entities/export-request.entity';
import { ExportChunk } from './entities/export-chunk.entity';
import { User } from '../user/entities/user.entity';
import { DataExportModule } from './data-export.module';
import { DataExportService } from './data-export.service';
import { ExportProcessor } from './export.processor';
import { EmailService } from '../email/email.service';
import { EXPORT_QUEUE_NAME } from './data-export.constants';

jest.mock('bull', () =>
  jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    close: jest.fn(),
    on: jest.fn(),
    process: jest.fn(),
  })),
);

describe('DataExportModule', () => {
  const mockRepository = () => ({
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  });

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockQueue = {
    add: jest.fn(),
    close: jest.fn(),
    on: jest.fn(),
    process: jest.fn(),
  };

  let moduleRef: TestingModule;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        DataExportService,
        ExportProcessor,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: getQueueToken(EXPORT_QUEUE_NAME),
          useValue: mockQueue,
        },
        {
          provide: getRepositoryToken(ExportRequest),
          useFactory: mockRepository,
        },
        {
          provide: getRepositoryToken(ExportChunk),
          useFactory: mockRepository,
        },
        {
          provide: getRepositoryToken(User),
          useFactory: mockRepository,
        },
      ],
    })
      .overrideProvider(EmailService)
      .useValue({ sendWelcomeEmail: jest.fn() })
      .compile();
  });

  afterEach(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
    jest.clearAllMocks();
  });

  it('registers export-queue explicitly on the module', () => {
    const imports =
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, DataExportModule) ?? [];

    const hasExplicitExportQueueRegistration = imports.some(
      (importedModule: any) =>
        importedModule?.providers?.some?.(
          (provider: any) =>
            provider?.provide === getQueueToken(EXPORT_QUEUE_NAME),
        ),
    );

    expect(hasExplicitExportQueueRegistration).toBe(true);
  });

  it('resolves the export queue token, service, and processor from Nest DI', () => {
    expect(moduleRef.get(getQueueToken(EXPORT_QUEUE_NAME))).toBeDefined();
    expect(moduleRef.get(DataExportService)).toBeDefined();
    expect(moduleRef.get(ExportProcessor)).toBeDefined();
  });
});
