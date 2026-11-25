import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { decodeCursor } from './cursor.util';

/**
 * Validates that a cursor string is a properly encoded base64-JSON object
 * with an ID and a recognized position field. Reject malformed cursors with
 * a clear 400 rather than silently restarting pagination from the first page.
 */
@ValidatorConstraint({ name: 'IsValidCursor', async: false })
export class IsValidCursorConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === undefined || value === null || value === '') return true; // optional field
    if (typeof value !== 'string') return false;
    const decoded = decodeCursor(value);
    if (
      decoded === undefined ||
      !('id' in decoded) ||
      (typeof decoded.id !== 'string' && typeof decoded.id !== 'number')
    ) {
      return false;
    }

    if (Number.isInteger(decoded.offset) && decoded.offset >= 0) return true;

    return ['created_at', 'createdAt', 'lastMessageAt'].some((key) => {
      const position = decoded[key];
      return typeof position === 'string' && Number.isFinite(Date.parse(position));
    });
  }

  defaultMessage(): string {
    return 'cursor must be a valid opaque pagination token.';
  }
}

export function IsValidCursor(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsValidCursorConstraint,
    });
  };
}
