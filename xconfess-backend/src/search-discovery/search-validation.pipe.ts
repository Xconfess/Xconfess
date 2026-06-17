import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { ErrorCode } from '../common/errors/error-codes';

export const searchValidationPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  exceptionFactory: (errors: ValidationError[]) =>
    new BadRequestException({
      message: 'Search query validation failed',
      code: ErrorCode.VALIDATION_FAILED,
      details: {
        fields: errors.map((error) => ({
          field: error.property,
          messages: Object.values(error.constraints ?? {}),
        })),
      },
    }),
});
