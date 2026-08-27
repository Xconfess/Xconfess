'use client';

import { Download, Loader2 } from 'lucide-react';
import { cn } from '@/app/lib/utils/cn';

export interface ExportCsvButtonProps {
  onClick: () => void;
  /** When true, disables the button and swaps the icon for a spinner. */
  isExporting?: boolean;
  /** Visible button label. Defaults to "Export CSV". */
  label?: string;
  className?: string;
}

/**
 * Shared export-to-CSV trigger used across all admin surfaces.
 *
 * Renders a consistent button with:
 * - A Download icon in the idle state
 * - A spinning Loader2 icon while exporting
 * - `aria-busy` + `aria-label` so screen readers announce progress
 * - `disabled` to prevent duplicate clicks during export
 */
export function ExportCsvButton({
  onClick,
  isExporting = false,
  label = 'Export CSV',
  className,
}: ExportCsvButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isExporting}
      aria-busy={isExporting}
      aria-label={isExporting ? 'Exporting, please wait…' : label}
      className={cn(
        'inline-flex items-center gap-2 rounded-md bg-gray-600 px-4 py-2 text-sm font-medium text-white',
        'transition-colors hover:bg-gray-700',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
    >
      {isExporting ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <Download className="h-4 w-4" aria-hidden="true" />
      )}
      <span>{isExporting ? 'Exporting…' : label}</span>
    </button>
  );
}
