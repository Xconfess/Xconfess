import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Report, ReportType, ReportStatus } from '../entities/report.entity';

export enum ReportPriority {
  LOW = 0,
  MEDIUM = 1,
  HIGH = 2,
  CRITICAL = 3,
}

@Injectable()
export class ReportPriorityService {
  private readonly logger = new Logger(ReportPriorityService.name);

  private readonly priorityMap: Record<ReportType, ReportPriority> = {
    [ReportType.HATE_SPEECH]: ReportPriority.CRITICAL,
    [ReportType.HARASSMENT]: ReportPriority.HIGH,
    [ReportType.INAPPROPRIATE_CONTENT]: ReportPriority.HIGH,
    [ReportType.SPAM]: ReportPriority.MEDIUM,
    [ReportType.COPYRIGHT]: ReportPriority.MEDIUM,
    [ReportType.OTHER]: ReportPriority.LOW,
  };

  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
  ) {}

  calculatePriority(report: Report): {
    priority: ReportPriority;
    reason: string;
  } {
    let priority = this.priorityMap[report.type] || ReportPriority.LOW;
    let reason = `Based on report type: ${report.type}`;

    // Boost priority for repeat offenders or recent escalations
    if (priority < ReportPriority.HIGH) {
      priority = ReportPriority.HIGH;
      reason = `Escalated due to high-risk content type: ${report.type}`;
    }

    return { priority, reason };
  }

  async updateReportPriority(report: Report): Promise<Report> {
    const { priority, reason } = this.calculatePriority(report);

    report.priority = priority;
    report.priorityReason = reason;
    report.priorityCalculatedAt = new Date();

    return this.reportRepository.save(report);
  }

  async recalculateAllPriorities(): Promise<void> {
    const reports = await this.reportRepository.find({
      where: {
        status: In([ReportStatus.PENDING, ReportStatus.REVIEWING]),
      },
    });

    for (const report of reports) {
      const { priority, reason } = this.calculatePriority(report);
      report.priority = priority;
      report.priorityReason = reason;
      report.priorityCalculatedAt = new Date();
    }

    if (reports.length > 0) {
      await this.reportRepository.save(reports);
      this.logger.log(
        `Recalculated priorities for ${reports.length} active reports`,
      );
    }
  }

  async getHighPriorityReports(
    limit: number = 50,
  ): Promise<Report[]> {
    return this.reportRepository.find({
      where: {
        status: In([ReportStatus.PENDING, ReportStatus.REVIEWING]),
        priority: In([ReportPriority.CRITICAL, ReportPriority.HIGH]),
      },
      order: { priority: 'DESC', createdAt: 'ASC' },
      take: limit,
    });
  }

  async getReportsByPriority(
    priority: ReportPriority,
    status?: ReportStatus,
    limit: number = 100,
  ): Promise<Report[]> {
    const query = this.reportRepository
      .createQueryBuilder('report')
      .where('report.priority = :priority', { priority });

    if (status) {
      query.andWhere('report.status = :status', { status });
    }

    return query
      .orderBy('report.createdAt', 'ASC')
      .take(limit)
      .getMany();
  }

  getPriorityLabel(priority: ReportPriority): string {
    switch (priority) {
      case ReportPriority.CRITICAL:
        return 'CRITICAL';
      case ReportPriority.HIGH:
        return 'HIGH';
      case ReportPriority.MEDIUM:
        return 'MEDIUM';
      case ReportPriority.LOW:
        return 'LOW';
      default:
        return 'UNKNOWN';
    }
  }
}
