import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Canonical payload for all login routes (POST /auth/login, POST /users/login).
 *
 * The email is normalised to lowercase + trimmed before validation so that
 * "User@Example.COM" and "user@example.com" are treated identically.
 *
 * Password validation is intentionally minimal: we do not re-enforce complexity
 * rules on login because an error such as "password must contain uppercase"
 * leaks policy information to an attacker enumerating accounts.
 */
export class LoginDto {
  @ApiProperty({
    description: 'Registered e-mail address (normalised to lower-case)',
    example: 'alice@example.com',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'email must be a valid e-mail address' })
  @IsNotEmpty({ message: 'email must not be empty' })
  email!: string;

  @ApiProperty({
    description: 'Account password',
    example: 'Str0ng!Pass#1',
  })
  @IsString()
  @IsNotEmpty({ message: 'password must not be empty' })
  password!: string;
}
