import { IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content: string;

  @IsString()
  @IsNotEmpty()
  anonymousContextId: string;

  /**
   * If provided, this comment is a reply to the given comment ID. The
   * server enforces a configurable maximum nesting depth (Issue #2122);
   * replies whose resulting depth would exceed `COMMENT_MAX_NESTING_DEPTH`
   * are rejected with 400.
   */
  @IsOptional()
  @IsNumber()
  parentId?: number;

  /**
   * Client-supplied idempotency key for replay safety.
   * When provided, duplicate submissions return the original comment
   * instead of creating a new one.
   */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  idempotencyKey?: string;
}
