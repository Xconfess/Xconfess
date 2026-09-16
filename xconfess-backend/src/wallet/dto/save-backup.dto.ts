import { IsInt, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class SaveBackupDto {
  @IsUUID() walletId!: string;
  @IsString() @MaxLength(200000) encryptedPayload!: string;
  @IsInt() @Min(1) encryptionVersion!: number;
}
