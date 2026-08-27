import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AdminGateway } from './admin.gateway';

@Injectable()
export class ReportsEventsListener {
  constructor(private readonly adminGateway: AdminGateway) {}

  @OnEvent('report.created')
  handleReportCreated(payload: any) {
    this.adminGateway.emitNewReport(payload);
  }

  @OnEvent('report.updated')
  handleReportUpdated(payload: any) {
    this.adminGateway.emitReportUpdated(payload);
  }

  @OnEvent('reports.bulk.updated')
  handleReportsBulkUpdated(payload: any) {
    this.adminGateway.emitReportsBulkUpdated(payload);
  }
}
