import {
  Controller,
  Post,
  Body,
  Param,
  Delete,
  Get,
  Patch,
  UseGuards,
  Req,
  Query,
} from "@nestjs/common";
import { CommentService } from "./comment.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Request as ExpressRequest } from "express";
import { AnonymousUser } from "../user/entities/anonymous-user.entity";
import { CreateCommentDto } from "./dto/create-comment.dto";
import { EditCommentDto } from "./dto/edit-comment.dto";
import { GetCommentsQueryDto } from "./dto/get-comments-query.dto";

interface RequestWithUser extends ExpressRequest {
  user?: any;
}

@Controller("confessions/:confessionId/comments")
export class CommentController {
  constructor(private readonly service: CommentService) {}

  /**
   * POST /confessions/:confessionId/comments
   * Create a new comment or reply (optional parentId for threading).
   */
  @UseGuards(JwtAuthGuard)
  @Post()
  create(
    @Param("confessionId") confessionId: string,
    @Body() dto: CreateCommentDto,
    @Req() req: RequestWithUser,
  ) {
    const user = req.user as AnonymousUser;
    return this.service.create(
      dto.content,
      user,
      confessionId,
      dto.anonymousContextId,
      dto.parentId,
      dto.idempotencyKey,
    );
  }

  /**
   * GET /confessions/:confessionId/comments
   * Returns threaded comments (top-level with nested replies).
   */
  @Get()
  findByConfession(
    @Param("confessionId") confessionId: string,
    @Query() query: GetCommentsQueryDto,
  ) {
    return this.service.findByConfessionId(confessionId, query);
  }

  /**
   * PATCH /confessions/:confessionId/comments/:id
   * Edit a comment within the 5-minute edit window.
   */
  @UseGuards(JwtAuthGuard)
  @Patch(":id")
  edit(
    @Param("id") id: string,
    @Body() dto: EditCommentDto,
    @Req() req: RequestWithUser,
  ) {
    const user = req.user as AnonymousUser;
    return this.service.edit(+id, dto.content, user);
  }

  /**
   * DELETE /confessions/:confessionId/comments/:id
   * Soft-delete a comment — content replaced with [deleted].
   */
  @UseGuards(JwtAuthGuard)
  @Delete(":id")
  remove(@Param("id") id: string, @Req() req: RequestWithUser) {
    const user = req.user as AnonymousUser;
    return this.service.delete(+id, user);
  }
}
