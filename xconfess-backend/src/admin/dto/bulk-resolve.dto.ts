import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class BulkResolveDto {
  @IsArray()
  @IsUUID('4', { each: true })
  reportIds: string[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
