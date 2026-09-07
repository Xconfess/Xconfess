export interface CursorObject {
  id: string | number;
  [key: string]: any;
}

/**
 * Encodes a cursor object into a base64 string.
 */
export function encodeCursor(cursorObj: CursorObject): string {
  const jsonString = JSON.stringify(cursorObj);
  return Buffer.from(jsonString).toString('base64');
}

/**
 * Decodes a base64 cursor string into an object.
 */
export function decodeCursor<T extends CursorObject>(
  cursor?: string,
): T | undefined {
  if (!cursor) return undefined;
  try {
    const jsonString = Buffer.from(cursor, 'base64').toString('utf8');
    const parsed = JSON.parse(jsonString);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return undefined;
    }
    return parsed as T;
  } catch (error) {
    return undefined;
  }
}
