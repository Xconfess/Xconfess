import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ExportProcessor } from './export.processor';
import { ExportRequest } from './entities/export-request.entity';
import { ExportChunk } from './entities/export-chunk.entity';
import { User } from '../user/entities/user.entity';
import { DataExportService } from './data-export.service';
import { EmailService } from '../email/email.service';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bull';

describe('ExportProcessor', () => {
  let processor: ExportProcessor;
  let exportRepo: any;
  let chunkRepo: any;
  let userRepo: any;
  let dataExportService: any;

  beforeEach(async () => {
    exportRepo = {
      update: jest.fn(),
    };
    chunkRepo = {
      save: jest.fn(),
    };
    userRepo = {
      findOneBy: jest.fn(),
    };
    dataExportService = {
      compileUserData: jest.fn(),
      convertToCsv: jest.fn(() => 'test,csv'),
      markExportFailed: jest.fn(),
      markExportProcessing: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExportProcessor,
        {
          provide: getRepositoryToken(ExportRequest),
          useValue: exportRepo,
        },
        {
          provide: getRepositoryToken(ExportChunk),
          useValue: chunkRepo,
        },
        {
          provide: getRepositoryToken(User),
          useValue: userRepo,
        },
        {
          provide: DataExportService,
          useValue: dataExportService,
        },
        {
          provide: EmailService,
          useValue: { sendWelcomeEmail: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
      ],
    }).compile();

    processor = module.get<ExportProcessor>(ExportProcessor);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('handleExport', () => {
    it('should process a chunked export successfully', async () => {
      const mockJob = {
        data: { userId: '1', requestId: 'req-1' },
      } as Job;

      dataExportService.compileUserData.mockResolvedValue({
        userId: '1',
        confessions: [{ id: 1, message: 'hello' }],
      });
      userRepo.findOneBy.mockResolvedValue({
        id: 1,
        emailEncrypted: 'test@example.com',
        username: 'testuser',
      });

      await processor.handleExport(mockJob);

      expect(dataExportService.compileUserData).toHaveBeenCalled();
      expect(dataExportService.markExportProcessing).toHaveBeenCalledWith(
        'req-1',
      );
      expect(exportRepo.update).toHaveBeenCalledWith(
        'req-1',
        expect.objectContaining({
          status: 'READY',
          isChunked: true,
        }),
      );
      expect(chunkRepo.save).toHaveBeenCalled();
    });

    it('should mark export as FAILED if error occurs', async () => {
      const mockJob = {
        data: { userId: '1', requestId: 'req-1' },
      } as Job;

      dataExportService.compileUserData.mockRejectedValue(
        new Error('Test error'),
      );

      await processor.handleExport(mockJob);

      expect(dataExportService.markExportProcessing).toHaveBeenCalledWith(
        'req-1',
      );
      expect(dataExportService.markExportFailed).toHaveBeenCalledWith(
        'req-1',
        'Test error',
      );
    });
  });
});
