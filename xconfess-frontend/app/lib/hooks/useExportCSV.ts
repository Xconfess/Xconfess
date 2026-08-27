'use client';

import { useCallback, useState } from 'react';
import { exportToCSV, CsvEmptyError } from '@/app/lib/utils/csvExport';
import { useGlobalToast } from '@/app/components/common/Toast';

export interface UseExportCSVOptions {
  /**
   * Short noun that names the exported data, used in toast copy.
   * e.g. "analytics", "reports"
   */
  label: string;
}

export interface UseExportCSVReturn {
  /**
   * Call this to kick off an export.
   * Handles empty-state, success, and failure toasts automatically.
   */
  triggerExport: (data: Record<string, unknown>[], filename: string) => void;
  /** True while the CSV is being generated and the download is initiated. */
  isExporting: boolean;
}

/**
 * Centralises CSV-export feedback so every admin export surface shows the
 * same success, empty-state, and failure messaging without browser alerts.
 *
 * @example
 * const { triggerExport, isExporting } = useExportCSV({ label: 'reports' });
 * triggerExport(rows, 'reports-2024-01-01.csv');
 */
export function useExportCSV({ label }: UseExportCSVOptions): UseExportCSVReturn {
  const [isExporting, setIsExporting] = useState(false);
  const toast = useGlobalToast();

  const triggerExport = useCallback(
    (data: Record<string, unknown>[], filename: string) => {
      setIsExporting(true);

      try {
        exportToCSV(data, filename);

        const rowWord = data.length === 1 ? 'row' : 'rows';
        toast.success(`${data.length} ${rowWord} exported to ${filename}.`);
      } catch (err) {
        if (err instanceof CsvEmptyError) {
          toast.warning(
            `No ${label} to export. Try adjusting your filters.`,
          );
        } else {
          toast.error('Export failed — please try again.');
        }
      } finally {
        setIsExporting(false);
      }
    },
    [label, toast],
  );

  return { triggerExport, isExporting };
}
