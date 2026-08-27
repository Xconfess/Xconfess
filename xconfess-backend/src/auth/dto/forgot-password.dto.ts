import { IsOptional, IsEmail, IsNumber, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiPropertyOptional({
    description: 'Registered e-mail address. Provide either email or userId.',
    example: 'alice@example.com',
  })
  @IsOptional()
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @ValidateIf((o) => !o.userId || o.email)
  email?: string;

  @ApiPropertyOptional({
    description: 'Numeric user ID. Provide either email or userId.',
    example: 42,
  })
  @IsOptional()
  @IsNumber({}, { message: 'User ID must be a number' })
  @ValidateIf((o) => !o.email || o.userId)
  userId?: number;

  // Custom validation to ensure at least one field is provided
  static validate(dto: ForgotPasswordDto): boolean {
    return !!(dto.email || dto.userId);
  }
}
