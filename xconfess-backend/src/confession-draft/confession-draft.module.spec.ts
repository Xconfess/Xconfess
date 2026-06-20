import { getQueueToken } from '@nestjs/bullmq';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { ConfessionService } from '../confession/confession.service';
import { ConfessionDraftQueue } from './confession-draft.queue';
import { ConfessionDraftModule } from './confession-draft.module';
import { ConfessionDraftService } from './confession-draft.service';
import { ConfessionDraft } from './entities/confession-draft.entity';

describe('ConfessionDraftModule registration', () => {
  const mockRepository = () => ({
    count: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  });

  const mockQueue = {
    add: jest.fn(),
    close: jest.fn(),
  };

  let moduleRef: TestingModule;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        ConfessionDraftService,
        ConfessionDraftQueue,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: unknown) => {
              if (key === 'ENABLE_BACKGROUND_JOBS') return 'false';
              if (key === 'app.confessionAesKey') {
                return '12345678901234567890123456789012';
              }
              return fallback ?? null;
            }),
          },
        },
        {
          provide: getRepositoryToken(ConfessionDraft),
          useFactory: mockRepository,
        },
        { provide: ConfessionService, useValue: { create: jest.fn() } },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn(async (cb: any) =>
              cb({ getRepository: mockRepository }),
            ),
          },
        },
        {
          provide: getQueueToken('confession-draft-publisher'),
          useValue: mockQueue,
        },
      ],
    }).compile();
  });

  afterEach(async () => {
    await moduleRef?.close();
    jest.clearAllMocks();
  });

  it('is imported by AppModule so draft routes are active at boot', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) ?? [];

    expect(imports).toContain(ConfessionDraftModule);
  });

  it('registers the publisher queue on the feature module', () => {
    const imports =
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, ConfessionDraftModule) ?? [];

    const hasPublisherQueueRegistration = imports.some((importedModule: any) =>
      importedModule?.providers?.some?.(
        (provider: any) =>
          provider?.provide === getQueueToken('confession-draft-publisher'),
      ),
    );

    expect(hasPublisherQueueRegistration).toBe(true);
  });

  it('resolves the draft service and queue without starting jobs when disabled', () => {
    expect(moduleRef.get(ConfessionDraftService)).toBeDefined();
    expect(moduleRef.get(ConfessionDraftQueue)).toBeDefined();
    expect(mockQueue.add).not.toHaveBeenCalled();
  });
});
