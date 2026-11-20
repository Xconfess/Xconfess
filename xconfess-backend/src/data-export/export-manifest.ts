export interface ExportManifest {
  generatedAt: string;
  files: string[];
  categories: { name: string; count: number }[];
}

/**
 * Describes what an export archive contains. Only category names, record
 * counts and file names are listed, never record contents or secrets.
 */
export function buildExportManifest(
  data: Record<string, any>,
  files: string[],
): ExportManifest {
  const categories = Object.keys(data)
    .filter((key) => !key.startsWith('_') && Array.isArray(data[key]))
    .map((name) => ({ name, count: data[name].length }));

  return {
    generatedAt: data.exportedAt ?? new Date().toISOString(),
    files: [...files],
    categories,
  };
}
