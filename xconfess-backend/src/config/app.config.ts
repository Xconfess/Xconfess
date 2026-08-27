import { registerAs } from '@nestjs/config';

/**
 * Typed "app" config namespace.
 *
 * Access via ConfigService: this.configService.get('app.port'), etc.
 */
export default registerAs('app', () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  backendUrl: process.env.BACKEND_URL ?? '',
  appSecret: process.env.APP_SECRET ?? '',
  confessionEncryptionKey: process.env.CONFESSION_ENCRYPTION_KEY ?? '',

  /**
   * Search observability settings.
   *
   * SEARCH_SLOW_QUERY_THRESHOLD_MS – duration above which a query is emitted as
   *   a structured warning (default: 500 ms).
   * SEARCH_SAMPLE_RATE – fraction of queries to record timing for, expressed as
   *   a value in [0, 1]. Set to 1 to capture every query, 0.1 for 10%, etc.
   *   Defaults to 0.1 so normal traffic incurs minimal overhead.
   */
  searchSlowQueryThresholdMs: parseInt(
    process.env.SEARCH_SLOW_QUERY_THRESHOLD_MS ?? '500',
    10,
  ),
  searchSampleRate: parseFloat(process.env.SEARCH_SAMPLE_RATE ?? '0.1'),
}));
