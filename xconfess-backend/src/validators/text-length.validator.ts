import { BadRequestException } from '@nestjs/common';

export interface TextLimitConfig {
  [field: string]: {
    min: number;
    max: number;
  };
}

export class TextLengthValidator {
  constructor(private limits: TextLimitConfig) {}

  validate(field: string, value: string | null | undefined): { valid: boolean; error?: string } {
    if (value === null || value === undefined) {
      const limit = this.limits[field];
      if (limit && limit.min > 0) {
        return {
          valid: false,
          error: `${field} is required and must be at least ${limit.min} character(s)`,
        };
      }
      return { valid: true };
    }

    const trimmed = value.trim();
    const limit = this.limits[field];

    if (!limit) {
      return { valid: true };
    }

    if (trimmed.length < limit.min) {
      return {
        valid: false,
        error: `${field} must be at least ${limit.min} character(s), got ${trimmed.length}`,
      };
    }

    if (trimmed.length > limit.max) {
      return {
        valid: false,
        error: `${field} must not exceed ${limit.max} character(s), got ${trimmed.length}`,
      };
    }

    return { valid: true };
  }

  validateMultiple(
    fields: { [field: string]: string | null | undefined },
  ): { valid: boolean; errors: { [field: string]: string } } {
    const errors: { [field: string]: string } = {};

    for (const [field, value] of Object.entries(fields)) {
      const result = this.validate(field, value);
      if (!result.valid && result.error) {
        errors[field] = result.error;
      }
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
    };
  }
}
