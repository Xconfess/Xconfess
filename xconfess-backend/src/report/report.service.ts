import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { Report, ReportStatus, ReportType } from '../admin/entities/report.entity';

export interface LegacyCreateReportDto {
  confessionId: string;
  type: ReportType;
  reason?: string;
  note?: string;
}

export interface LegacyUpdateReportDto {
  status: ReportStatus.RESOLVED | ReportStatus.DISMISSED;
  note?: string;
  resolutionReason?: string;
}

@Injectable()
export class ReportService {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
  ) {}

  async create(
    dto: LegacyCreateReportDto,
    reporterId: number | null,
  ): Promise<Report> {
    const idempotencyKey = createHash('sha256')
      .update(`${reporterId}-${dto.confessionId}-${dto.type}`)
      .digest('hex');

    const existing = await this.reportRepository.findOne({
      where: { idempotencyKey },
    });
    if (existing) {
      return existing;
    }

    const report = this.reportRepository.create({
      confessionId: dto.confessionId,
      reporterId,
      type: dto.type,
      reason: dto.reason ?? dto.note ?? null,
      idempotencyKey,
    });

    return this.reportRepository.save(report);
  }

  async findAll(): Promise<Report[]> {
    return this.reportRepository.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<Report> {
    const report = await this.reportRepository.findOne({ where: { id } });
    if (!report) throw new NotFoundException(`Report #${id} not found`);
    return report;
  }

  async updateStatus(id: string, dto: LegacyUpdateReportDto): Promise<Report> {
    const report = await this.findOne(id);
    report.status = dto.status;
    if (dto.note !== undefined || dto.resolutionReason !== undefined) {
      report.resolutionNotes = dto.note ?? dto.resolutionReason ?? null;
    }
    return this.reportRepository.save(report);
  }

  async resolve(id: string, note?: string): Promise<Report> {
    return this.updateStatus(id, { status: ReportStatus.RESOLVED, note });
  }

  async dismiss(id: string, note?: string): Promise<Report> {
    return this.updateStatus(id, { status: ReportStatus.DISMISSED, note });
  }
}
