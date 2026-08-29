import { Test } from '@nestjs/testing';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { ReportModule } from './report.module';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { Report } from '../admin/entities/report.entity';
import { AnonymousConfession } from '../confession/entities/confession.entity';
import { OutboxEvent } from '../common/entities/outbox-event.entity';
import { AnonymousUser } from '../user/entities/anonymous-user.entity';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuthModule } from '../auth/auth.module';

const mockRepository = () => ({
  create: jest.fn(),
  createQueryBuilder: jest.fn(),
  findOne: jest.fn(),
  manager: { transaction: jest.fn() },
  save: jest.fn(),
});

async function compileReportTestingModule() {
  return Test.createTestingModule({
    controllers: [ReportsController],
    providers: [
      ReportsService,
      { provide: getRepositoryToken(Report), useValue: mockRepository() },
      {
        provide: getRepositoryToken(AnonymousConfession),
        useValue: mockRepository(),
      },
      { provide: getRepositoryToken(AnonymousUser), useValue: mockRepository() },
      { provide: getRepositoryToken(OutboxEvent), useValue: mockRepository() },
      {
        provide: AuditLogService,
        useValue: {
          findByEntity: jest.fn(),
          logReport: jest.fn().mockResolvedValue(undefined),
          logReportDismissed: jest.fn().mockResolvedValue(undefined),
          logReportResolved: jest.fn().mockResolvedValue(undefined),
        },
      },
    ],
  }).compile();
}

describe('ReportModule', () => {
  it('should compile report providers without DI errors', async () => {
    const moduleRef = await compileReportTestingModule();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });

  it('should resolve ReportsService with repository dependencies', async () => {
    const moduleRef = await compileReportTestingModule();

    const reportsService = moduleRef.get<ReportsService>(ReportsService);
    expect(reportsService).toBeDefined();
    expect(reportsService).toBeInstanceOf(ReportsService);

    await moduleRef.close();
  });

  it('should resolve ReportsController', async () => {
    const moduleRef = await compileReportTestingModule();

    const reportsController =
      moduleRef.get<ReportsController>(ReportsController);
    expect(reportsController).toBeDefined();

    await moduleRef.close();
  });

  it('should fail DI if AnonymousConfession repository is missing', async () => {
    const faultyModule = Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: getRepositoryToken(Report), useValue: mockRepository() },
        { provide: getRepositoryToken(AnonymousUser), useValue: mockRepository() },
        { provide: getRepositoryToken(OutboxEvent), useValue: mockRepository() },
        { provide: AuditLogService, useValue: {} },
      ],
      controllers: [ReportsController],
    });

    await expect(faultyModule.compile()).rejects.toThrow();
  });

  it('should import repositories and modules needed by ReportModule', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      ReportModule,
    ) as any[];

    expect(imports).toEqual(expect.arrayContaining([AuditLogModule, AuthModule]));

    const typeOrmImport = imports.find(
      (moduleImport) => moduleImport?.module === TypeOrmModule,
    );
    const providerTokens = (typeOrmImport?.providers ?? []).map(
      (provider: { provide: unknown }) => provider.provide,
    );

    expect(providerTokens).toEqual(
      expect.arrayContaining([
        getRepositoryToken(Report),
        getRepositoryToken(AnonymousConfession),
        getRepositoryToken(AnonymousUser),
        getRepositoryToken(OutboxEvent),
      ]),
    );
  });
});
