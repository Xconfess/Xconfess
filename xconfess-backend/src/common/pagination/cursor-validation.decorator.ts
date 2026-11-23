import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { decodeCursor } from './cursor.util';

/**
 * Validates that a cursor string is a properly encoded base64-JSON object
 * with at least an `id` field.  Rejects malformed cursors with a clear 400
 * so callers know the value is corrupt rather than silently discarding it.
 */
@ValidatorConstraint({ name: 'IsValidCursor', async: false })
export class IsValidCursorConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === undefined || value === null || value === '') return true; // optional field
    if (typeof value !== 'string') return false;
    const decoded = decodeCursor(value);
    return decoded !== undefined && 'id' in decoded;
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
