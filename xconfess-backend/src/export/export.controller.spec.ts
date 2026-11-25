import { NotFoundException } from '@nestjs/common';
import { ExportController } from './export.controller';

/**
 * Authorization matrix for the user-owned export routes.
 *
 * The owner receives the export; foreign, unknown and expired exports all map
 * to the same 404 so the response never confirms that another user's export
 * exists.
 */
describe('ExportController authorization matrix', () => {
  let exportService: {
    getExportFile: jest.Mock;
    getExportHistory: jest.Mock;
  };
  let controller: ExportController;

  const requestFor = (userId: string) => ({ user: { sub: userId } });

  beforeEach(() => {
    exportService = {
      getExportFile: jest.fn(),
      getExportHistory: jest.fn().mockResolvedValue([]),
    };
    controller = new ExportController(exportService as any);
  });

  describe('GET /export/jobs/:userId/:jobId/download', () => {
    it('returns the export artifact to its owner', async () => {
      const job = { fileData: Buffer.from('zip'), status: 'READY' };
      exportService.getExportFile.mockResolvedValue(job);

      await expect(
        controller.downloadExportJob('user-a', 'job-1', requestFor('user-a')),
      ).resolves.toBe(job);
      expect(exportService.getExportFile).toHaveBeenCalledWith(
        'job-1',
        'user-a',
      );
    });

    it('returns the same 404 for a foreign export and an unknown export', async () => {
      // The repository is scoped by (id, userId), so both lookups miss.
      exportService.getExportFile.mockResolvedValue(null);

      let foreignError: any;
      try {
        await controller.downloadExportJob(
          'user-a',
          'job-owned-by-user-b',
          requestFor('user-a'),
        );
      } catch (caught) {
        foreignError = caught;
      }

      let unknownError: any;
      try {
        await controller.downloadExportJob(
          'user-a',
          'job-does-not-exist',
          requestFor('user-a'),
        );
      } catch (caught) {
        unknownError = caught;
      }

      expect(foreignError).toBeInstanceOf(NotFoundException);
      expect(foreignError.getStatus()).toBe(404);
      expect(unknownError.getStatus()).toBe(404);
      expect(foreignError.message).toBe(unknownError.message);
      expect(foreignError.message).toBe('Export not found or expired');
    });
  });

  describe('GET /export/jobs/:userId', () => {
    it('scopes the history lookup to the authenticated user, not the path param', async () => {
      await controller.getExportJobs('someone-else', requestFor('user-a'));

      expect(exportService.getExportHistory).toHaveBeenCalledWith('user-a');
    });
  });
});
