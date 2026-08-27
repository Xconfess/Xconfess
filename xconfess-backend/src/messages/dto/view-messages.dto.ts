import { IsUUID } from 'class-validator';

export class ViewMessagesDto {
  @IsUUID()
  confession_id: string;
}
