import { PartialType, PickType } from '@nestjs/mapped-types';
import { IsNumber, IsOptional } from 'class-validator';
import { CreateConfessionDraftDto } from './create-confession-draft.dto';

export class UpdateConfessionDraftDto extends PartialType(
  PickType(CreateConfessionDraftDto, ['content', 'category'] as const),
) {
  @IsOptional()
  @IsNumber()
  version?: number;
}
