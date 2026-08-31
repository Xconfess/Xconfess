import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ModerationStatus } from '../ai-moderation.service';

export class TransitionModerationDto {
  @IsEnum(ModerationStatus)
  nextState: ModerationStatus;

  @IsString()
  @MinLength(3, { message: 'A reason is required for every moderation transition.' })
  @MaxLength(2000)
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}