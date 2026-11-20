import { registerAs } from '@nestjs/config';

/**
 * Comment-module configuration.
 *
 * Access via ConfigService: `this.configService.get('comment.maxNestingDepth')`.
 *
 * `maxNestingDepth` caps how deep a reply chain can grow. A top-level
 * comment has depth 0; its direct reply has depth 1, a reply to that
 * reply has depth 2, and so on. The server rejects a new reply whose
 * depth would exceed this value. The default of 1 preserves the historic
 * "replies to replies are not supported" behaviour; operators can raise
 * the cap by setting `COMMENT_MAX_NESTING_DEPTH` in the environment.
 */
export default registerAs('comment', () => ({
  maxNestingDepth: parseInt(process.env.COMMENT_MAX_NESTING_DEPTH ?? '1', 10),
}));
