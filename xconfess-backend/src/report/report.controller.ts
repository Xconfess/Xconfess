import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import {
  LegacyCreateReportDto,
  LegacyUpdateReportDto,
  ReportService,
} from './report.service';

@ApiTags('Reports')
@Controller('reports')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Post()
  @ApiOperation({ summary: 'Submit a report for a confession' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['confessionId', 'type'],
      properties: {
        confessionId: { type: 'string' },
        type: { type: 'string' },
        reason: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Report submitted.',
    schema: {
      example: {
        id: 'b1a2c3d4-e5f6-7890-abcd-ef1234567890',
        confessionId: 101,
        type: 'offensive',
        note: 'This post contains hate speech.',
        status: 'pending',
        createdAt: '2026-04-25T10:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  create(@Body() dto: LegacyCreateReportDto) {
    return this.reportService.create(dto, null);
  }

  @Get()
  @ApiOperation({ summary: 'List all reports (admin)' })
  @ApiResponse({
    status: 200,
    description: 'Array of report records.',
    schema: {
      example: [
        {
          id: 'b1a2c3d4-e5f6-7890-abcd-ef1234567890',
          confessionId: 101,
          type: 'spam',
          status: 'pending',
          createdAt: '2026-04-25T10:00:00.000Z',
        },
      ],
    },
  })
  findAll() {
    return this.reportService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single report by ID' })
  @ApiParam({ name: 'id', description: 'Numeric report ID' })
  @ApiResponse({
    status: 200,
    description: 'Report found.',
    schema: {
      example: {
        id: 'b1a2c3d4-e5f6-7890-abcd-ef1234567890',
        confessionId: 101,
        type: 'offensive',
        status: 'pending',
        note: 'This post contains hate speech.',
        createdAt: '2026-04-25T10:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Report not found.' })
  findOne(@Param('id') id: string) {
    return this.reportService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update report status' })
  @ApiParam({ name: 'id', description: 'Numeric report ID' })
  @ApiResponse({
    status: 200,
    description: 'Report status updated.',
    schema: {
      example: { id: 'b1a2c3d4-...', status: 'approved', updatedAt: '2026-04-25T11:00:00.000Z' },
    },
  })
  update(@Param('id') id: string, @Body() dto: LegacyUpdateReportDto) {
    return this.reportService.updateStatus(id, dto);
  }

  @Patch(':id/resolve')
  @ApiOperation({ summary: 'Mark a report as resolved' })
  @ApiParam({ name: 'id', description: 'Numeric report ID' })
  @ApiResponse({
    status: 200,
    description: 'Report resolved.',
    schema: {
      example: { id: 'b1a2c3d4-...', status: 'resolved', resolvedAt: '2026-04-25T11:30:00.000Z' },
    },
  })
  resolve(@Param('id') id: string) {
    return this.reportService.resolve(id);
  }

  @Patch(':id/dismiss')
  @ApiOperation({ summary: 'Dismiss a report (no action taken)' })
  @ApiParam({ name: 'id', description: 'Numeric report ID' })
  @ApiResponse({
    status: 200,
    description: 'Report dismissed.',
    schema: {
      example: { id: 'b1a2c3d4-...', status: 'rejected', updatedAt: '2026-04-25T11:45:00.000Z' },
    },
  })
  dismiss(@Param('id') id: string) {
    return this.reportService.dismiss(id);
  }
}
