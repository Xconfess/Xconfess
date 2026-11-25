import { registerAs } from '@nestjs/config';

/**
 * Configurable maximum lengths for user-generated text fields.
 * Access via ConfigService: this.configService.get('textLimits.confession'), etc.
 */
export default registerAs('textLimits', () => ({
  confession: {
    min: 1,
    max: parseInt(process.env.TEXT_LIMIT_CONFESSION_MAX ?? '5000', 10),
  },
  confessionTitle: {
    min: 0,
    max: parseInt(process.env.TEXT_LIMIT_CONFESSION_TITLE_MAX ?? '200', 10),
  },
  comment: {
    min: 1,
    max: parseInt(process.env.TEXT_LIMIT_COMMENT_MAX ?? '2000', 10),
  },
  message: {
    min: 1,
    max: parseInt(process.env.TEXT_LIMIT_MESSAGE_MAX ?? '4000', 10),
  },
  username: {
    min: 3,
    max: parseInt(process.env.TEXT_LIMIT_USERNAME_MAX ?? '30', 10),
  },
  bio: {
    min: 0,
    max: parseInt(process.env.TEXT_LIMIT_BIO_MAX ?? '500', 10),
  },
  reportReason: {
    min: 1,
    max: parseInt(process.env.TEXT_LIMIT_REPORT_REASON_MAX ?? '1000', 10),
  },
}));
