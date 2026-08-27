import { IsNotEmpty, IsUUID, IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateReactionDto {
  @ApiProperty({
    description: 'UUID of the confession to react to.',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @IsUUID()
  @IsNotEmpty()
  confessionId: string;

  @ApiProperty({
    description: 'Emoji to react with.',
    example: '👍',
  })
  @IsString()
  @IsNotEmpty()
  emoji: string;

  @ApiPropertyOptional({
    description: 'Anonymous user UUID (optional, derived from context if omitted).',
  })
  @IsOptional()
  @IsUUID()
  anonymousUserId?: string;
}
