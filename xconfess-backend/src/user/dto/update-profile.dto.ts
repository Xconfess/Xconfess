import { IsBoolean, IsEnum, IsInt, IsOptional, Min } from 'class-validator';

export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
  OTHER = 'other',
}

export class UpdateUserProfileDto {
  @IsEnum(Gender)
  gender: Gender;

  @IsOptional()
  @IsInt()
  @Min(0)
  age?: number;

  @IsBoolean()
  can_receive_messages: boolean;
}
