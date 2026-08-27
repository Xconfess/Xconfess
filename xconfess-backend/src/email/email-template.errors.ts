export type EmailTemplateErrorCode =
  | 'template_not_found'
  | 'template_version_not_found'
  | 'template_active_version_missing';

export class EmailTemplateError extends Error {
  readonly code: EmailTemplateErrorCode;
  readonly templateKey: string;
  readonly templateVersion?: string;
  readonly details?: Record<string, unknown>;

  constructor(args: {
    code: EmailTemplateErrorCode;
    templateKey: string;
    templateVersion?: string;
    message: string;
    details?: Record<string, unknown>;
  }) {
    super(args.message);
    this.name = 'EmailTemplateError';
    this.code = args.code;
    this.templateKey = args.templateKey;
    this.templateVersion = args.templateVersion;
    this.details = args.details;
  }
}

export class EmailTemplateNotFoundError extends EmailTemplateError {
  constructor(templateKey: string) {
    super({
      code: 'template_not_found',
      templateKey,
      message: `Email template not found: ${templateKey}`,
    });
    this.name = 'EmailTemplateNotFoundError';
  }
}

export class EmailTemplateVersionNotFoundError extends EmailTemplateError {
  constructor(templateKey: string, templateVersion: string) {
    super({
      code: 'template_version_not_found',
      templateKey,
      templateVersion,
      message: `Email template version not found: ${templateKey}@${templateVersion}`,
    });
    this.name = 'EmailTemplateVersionNotFoundError';
  }
}

export class EmailTemplateActiveVersionMissingError extends EmailTemplateError {
  constructor(templateKey: string, templateVersion: string) {
    super({
      code: 'template_active_version_missing',
      templateKey,
      templateVersion,
      message: `Email template active version missing: ${templateKey}@${templateVersion}`,
    });
    this.name = 'EmailTemplateActiveVersionMissingError';
  }
}
