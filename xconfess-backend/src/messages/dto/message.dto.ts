import { IsUUID, IsString, MinLength, MaxLength, IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateMessageDto {
  @ApiProperty({ description: 'UUID of the confession to message about' })
  @IsUUID()
  confession_id: string;

  @ApiProperty({
    description: 'Message content',
    minLength: 1,
    maxLength: 1000,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  content: string;
}

export class ReplyMessageDto {
  @ApiProperty({ description: 'ID of the message to reply to' })
  @IsInt()
  message_id: number;

  @ApiProperty({ description: 'Reply content', minLength: 1, maxLength: 1000 })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  reply: string;
}
