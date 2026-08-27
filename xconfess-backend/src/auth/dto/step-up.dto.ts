import { IsOptional, IsString, MinLength, MaxLength } from 'class-validator';

/**
 * Payload for {@link AuthController.stepUp}. Exactly one of `password` or
 * `totpToken` should be supplied to re-prove control of the account.
 */
export class StepUpDto {
  @IsOptional()
  @IsString({ message: 'Password must be a string' })
  @MinLength(1, { message: 'Password must not be empty' })
  password?: string;

  @IsOptional()
  @IsString({ message: 'TOTP token must be a string' })
  @MinLength(6, { message: 'TOTP token must be 6 digits' })
  @MaxLength(10, { message: 'TOTP token is too long' })
  totpToken?: string;
}
