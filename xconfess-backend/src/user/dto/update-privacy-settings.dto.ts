// xconfess-backend/src/user/dto/update-privacy-settings.dto.ts

import { IsBoolean, IsOptional } from 'class-validator';

export class UpdatePrivacySettingsDto {
  @IsOptional()
  @IsBoolean()
  isDiscoverable?: boolean;

  @IsOptional()
  @IsBoolean()
  canReceiveReplies?: boolean;

  @IsOptional()
  @IsBoolean()
  showReactions?: boolean;

  @IsOptional()
  @IsBoolean()
  dataProcessingConsent?: boolean;
}

export class PrivacySettingsResponseDto {
  isDiscoverable: boolean;
  canReceiveReplies: boolean;
  showReactions: boolean;
  dataProcessingConsent: boolean;
}
