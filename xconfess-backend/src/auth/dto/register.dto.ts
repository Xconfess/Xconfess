import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Canonical payload for all registration routes (POST /auth/register, POST /users/register).
 *
 * All three fields are required (no @IsOptional).
 * Unknown fields are rejected with 400 by the global ValidationPipe.
 */
export class RegisterDto {
  @ApiProperty({
    description:
      'Valid e-mail address. Normalised to lower-case before storage.',
    example: 'alice@example.com',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'email must be a valid e-mail address' })
  @IsNotEmpty({ message: 'email must not be empty' })
  email!: string;

  @ApiProperty({
    description:
      'Password — min 8, max 72 chars; must include uppercase, lowercase, digit, and special character.',
    example: 'Str0ng!Pass#1',
    minLength: 8,
    maxLength: 72,
  })
  @IsString()
  @MinLength(8, { message: 'password must be at least 8 characters' })
  @MaxLength(72, { message: 'password must be at most 72 characters' })
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/,
    {
      message:
        'password must contain at least one uppercase letter, one lowercase letter, one digit, and one special character',
    },
  )
  password!: string;

  @ApiProperty({
    description:
      'Display name (3–30 chars, alphanumeric and underscores only).',
    example: 'alice_42',
    minLength: 3,
    maxLength: 30,
  })
  @IsString()
  @MinLength(3, { message: 'username must be at least 3 characters' })
  @MaxLength(30, { message: 'username must be at most 30 characters' })
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'username may only contain letters, numbers, and underscores',
  })
  username!: string;
}
