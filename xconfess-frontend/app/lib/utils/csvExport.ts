/** Thrown when there is no data to include in the CSV. */
export class CsvEmptyError extends Error {
  constructor() {
    super('No data to export.');
    this.name = 'CsvEmptyError';
  }
}

/**
 * Serialises `data` to a CSV file and triggers a browser download.
 *
 * @throws {CsvEmptyError}  when `data` is empty.
 * @throws {Error}          when the browser fails to create or download the file.
 */
export function exportToCSV(data: Record<string, unknown>[], filename: string): void {
  if (data.length === 0) {
    throw new CsvEmptyError();
  }

  const headers = Object.keys(data[0]);

  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
    return `"${String(value).replace(/"/g, '""')}"`;
  };

  const csvContent = [
    headers.join(','),
    ...data.map((row) => headers.map((h) => escape(row[h])).join(',')),
  ].join('\n');

  try {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (err) {
    throw new Error(
      `Failed to create CSV download: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
