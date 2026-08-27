import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class EditCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content: string;
}
