import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { EmailService, TemplatePreviewResult } from './email.service';
import { AdminGuard } from '../auth/admin.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

// ── Request DTO ───────────────────────────────────────────────────────────────

export class PreviewTemplateDto {
  /**
   * Registered template key, e.g. "welcome", "password_reset"
   */
  templateKey: string;

  /**
   * Sample variable map to render with, e.g. { username: "Alice" }
   */
  vars: Record<string, string>;

  /**
   * Optional specific version to preview (e.g. "v2").
   * Omit to preview the currently active version.
   */
  version?: string;
}

// ── Response shape ────────────────────────────────────────────────────────────

export interface PreviewTemplateResponse {
  ok: boolean;
  preview: TemplatePreviewResult;
}

// ── Controller ────────────────────────────────────────────────────────────────

@Controller('admin/email')
@UseGuards(JwtAuthGuard, AdminGuard)
export class EmailController {
  private readonly logger = new Logger(EmailController.name);

  constructor(private readonly emailService: EmailService) {}

  /**
   * POST /admin/email/preview
   *
   * Renders a registered template with the provided sample variables and
   * returns the rendered subject/html/text plus any validation errors.
   *
   * This endpoint NEVER sends an email or enqueues a notification job.
   *
   * Request body:
   * {
   *   "templateKey": "welcome",
   *   "vars": { "username": "Alice" },
   *   "version": "v2"          // optional — omit for active version
   * }
   *
   * Success response (200):
   * {
   *   "ok": true,
   *   "preview": {
   *     "templateKey": "welcome",
   *     "version": "v2",
   *     "lifecycleState": "canary",
   *     "rendered": {
   *       "subject": "Hello from XConfess!",
   *       "html": "<h1>Hello, Alice! Enjoy XConfess.</h1>",
   *       "text": "Hello, Alice! Enjoy XConfess."
   *     },
   *     "validationErrors": [],
   *     "missingVars": [],
   *     "requiredVars": ["username"]
   *   }
   * }
   *
   * Validation error response (200 with validationErrors):
   * {
   *   "ok": false,
   *   "preview": {
   *     "templateKey": "welcome",
   *     "version": "v1",
   *     "lifecycleState": "active",
   *     "rendered": null,
   *     "validationErrors": ["Missing required variable: \"username\""],
   *     "missingVars": ["username"],
   *     "requiredVars": ["username"]
   *   }
   * }
   */
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  previewTemplate(@Body() body: PreviewTemplateDto): PreviewTemplateResponse {
    // Guard against missing required body fields
    if (!body?.templateKey || typeof body.templateKey !== 'string') {
      throw new BadRequestException(
        'templateKey is required and must be a string',
      );
    }

    if (
      !body?.vars ||
      typeof body.vars !== 'object' ||
      Array.isArray(body.vars)
    ) {
      throw new BadRequestException(
        'vars is required and must be a key-value object of strings',
      );
    }

    // Ensure all var values are strings (prevent object injection)
    for (const [k, v] of Object.entries(body.vars)) {
      if (typeof v !== 'string') {
        throw new BadRequestException(`Variable "${k}" must be a string value`);
      }
    }

    this.logger.log(
      `[admin] Template preview requested: key="${body.templateKey}" version="${body.version ?? 'active'}" vars=[${Object.keys(body.vars).join(', ')}]`,
    );

    const preview = this.emailService.previewTemplate(
      body.templateKey,
      body.vars,
      body.version,
    );

    return {
      ok: preview.validationErrors.length === 0,
      preview,
    };
  }
}
