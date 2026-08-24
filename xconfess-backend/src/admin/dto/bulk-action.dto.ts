import { IsArray, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export enum BulkAction {
  APPROVE = 'approve',
  REJECT = 'reject',
  BAN = 'ban',
}

export class BulkActionDto {
  @IsArray()
  @IsUUID('4', { each: true })
  reportIds: string[];

  @IsEnum(BulkAction)
  action: BulkAction;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
