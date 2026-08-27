import { DlqAdminController } from './dlq-admin.controller';
import { JobManagementService } from './services/job-management.service';

describe('DlqAdminController', () => {
  let controller: DlqAdminController;
  let jobManagementService: jest.Mocked<Pick<JobManagementService, 'replayDlqJob'>>;

  beforeEach(() => {
    jobManagementService = {
      replayDlqJob: jest.fn().mockResolvedValue({
        id: 'dlq-1',
        outcome: 'replayed',
        replayJobId: 'dlq-replay:orig-dlq-1',
        newJobId: 'dlq-replay:orig-dlq-1',
      }),
    };

    controller = new DlqAdminController(jobManagementService as any);
  });

  it('passes replay reason and audit context to the job management service', async () => {
    const req = {
      user: { id: 42 },
      requestId: 'req-dlq-retry',
      ip: '127.0.0.1',
      headers: {
        'user-agent': 'jest',
      },
    };

    await controller.retry('dlq-1', 'manual replay after SMTP fix', req);

    expect(jobManagementService.replayDlqJob).toHaveBeenCalledWith(
      'dlq-1',
      '42',
      'manual replay after SMTP fix',
      {
        requestId: 'req-dlq-retry',
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      },
    );
  });
});