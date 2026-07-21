import * as Joi from 'joi';

/**
 * Centralized environment-variable validation schema.
 *
 * Called by ConfigModule.forRoot() at bootstrap.
 * If any required variable is missing or invalid the app exits
 * immediately with an actionable error message.
 */
export const envValidationSchema = Joi.object({
  // ── Core ──────────────────────────────────────────────────────────────
  NODE_ENV: Joi.string()
    .valid('development', 'dev', 'local', 'production', 'test', 'ci', 'staging')
    .default('development'),
  APP_ENV: Joi.string().optional(),
  PORT: Joi.number().port().default(3000),

  // ── API Docs ──────────────────────────────────────────────────────────
  // Swagger must be explicitly opted into. It is never derived from
  // NODE_ENV, so a mislabeled or unexpected environment name can't
  // accidentally expose the full API surface.
  ENABLE_SWAGGER: Joi.string().valid('true', 'false').default('false'),

  // ── Database ──────────────────────────────────────────────────────────
  DB_HOST: Joi.string().required().messages({
    'any.required': 'DB_HOST is required – set the PostgreSQL hostname.',
  }),
  DB_PORT: Joi.number().port().default(5432),
  DB_USERNAME: Joi.string().required().messages({
    'any.required': 'DB_USERNAME is required – set the PostgreSQL user.',
  }),
  DB_PASSWORD: Joi.string().required().allow('').messages({
    'any.required': 'DB_PASSWORD is required – set the PostgreSQL password.',
  }),
  DB_NAME: Joi.string().required().messages({
    'any.required': 'DB_NAME is required – set the PostgreSQL database name.',
  }),
  DB_READ_HOST: Joi.string().optional(),
  DB_READ_PORT: Joi.number().port().optional(),
  TYPEORM_SYNCHRONIZE: Joi.string()
    .valid('true', 'false', '1', '0', 'yes', 'no', 'on', 'off')
    .optional(),
  TYPEORM_MIGRATIONS_RUN: Joi.string()
    .valid('true', 'false', '1', '0', 'yes', 'no', 'on', 'off')
    .optional(),

  // ── Auth ──────────────────────────────────────────────────────────────
  JWT_SECRET: Joi.string().min(8).required().messages({
    'any.required': 'JWT_SECRET is required – generate a strong random string.',
    'string.min': 'JWT_SECRET must be at least 8 characters.',
  }),

  // ── App / URLs ────────────────────────────────────────────────────────
  APP_SECRET: Joi.string().optional(),
  BACKEND_URL: Joi.string().uri().optional(),
  FRONTEND_URL: Joi.string().default('http://localhost:3000'),

  // ── Encryption ────────────────────────────────────────────────────────
  CONFESSION_ENCRYPTION_KEY: Joi.string().hex().length(64).required().messages({
    'string.length':
      'CONFESSION_ENCRYPTION_KEY must be exactly 64 characters (32-byte hex).',
    'string.hex':
      'CONFESSION_ENCRYPTION_KEY must be a valid hexadecimal string.',
    'any.required':
      'CONFESSION_ENCRYPTION_KEY is required for confession security.',
  }),

  // ── Stellar ───────────────────────────────────────────────────────────
  STELLAR_FEATURES_ENABLED: Joi.string()
    .valid('true', 'false')
    .default('false'),
  STELLAR_NETWORK: Joi.string().valid('testnet', 'mainnet').default('testnet'),
  STELLAR_HORIZON_URL: Joi.string()
    .uri()
    .default('https://horizon-testnet.stellar.org'),
  STELLAR_SOROBAN_RPC_URL: Joi.string()
    .uri()
    .default('https://soroban-rpc-testnet.stellar.org'),
  DEPLOYMENT_METADATA_PATH: Joi.string().optional(),
  CONFESSION_ANCHOR_CONTRACT_ID: Joi.string().optional(),
  REPUTATION_BADGES_CONTRACT_ID: Joi.string().optional(),
  TIPPING_SYSTEM_CONTRACT_ID: Joi.string().optional(),
  STELLAR_SERVER_SECRET: Joi.string().optional(),

  // ── Tipping SLA ────────────────────────────────────────────────────────
  TIP_VERIFICATION_STALE_THRESHOLD_MINUTES: Joi.number().min(1).default(30),

  // ── Email (primary) ──────────────────────────────────────────────────
  MAIL_HOST: Joi.string().default('smtp.ethereal.email'),
  MAIL_PORT: Joi.number().port().default(587),
  MAIL_SECURE: Joi.string().valid('true', 'false').default('false'),
  MAIL_USER: Joi.string().allow('').default(''),
  MAIL_PASSWORD: Joi.string().allow('').default(''),
  MAIL_FROM: Joi.string().default('noreply@xconfess.app'),
  MAIL_TEST_USER: Joi.string().optional(),
  MAIL_TEST_PASS: Joi.string().optional(),

  // ── Email (fallback) ─────────────────────────────────────────────────
  MAIL_FALLBACK_HOST: Joi.string().optional(),
  MAIL_FALLBACK_PORT: Joi.number().port().default(587),
  MAIL_FALLBACK_SECURE: Joi.string().valid('true', 'false').default('false'),
  MAIL_FALLBACK_USER: Joi.string().allow('').optional(),
  MAIL_FALLBACK_PASSWORD: Joi.string().allow('').optional(),
  MAIL_FALLBACK_FROM: Joi.string().optional(),

  // ── Email templates / SLO ────────────────────────────────────────────
  EMAIL_WELCOME_CANARY_WEIGHT: Joi.number().min(0).max(100).default(0),
  EMAIL_ROLLOUT_KILLSWITCH: Joi.string()
    .valid('true', 'false')
    .default('false'),
  EMAIL_TEMPLATE_SLO_WINDOW_MINUTES: Joi.number().default(15),
  EMAIL_TEMPLATE_SLO_ACTIVE_MAX_ERROR_RATE_PERCENT: Joi.number().default(5),
  EMAIL_TEMPLATE_SLO_ACTIVE_MAX_P95_LATENCY_MS: Joi.number().default(1200),
  EMAIL_TEMPLATE_SLO_ACTIVE_MIN_SAMPLE_SIZE: Joi.number().default(20),
  EMAIL_TEMPLATE_SLO_ACTIVE_ALERT_AFTER_BREACHES: Joi.number().default(2),
  EMAIL_TEMPLATE_SLO_CANARY_MAX_ERROR_RATE_PERCENT: Joi.number().default(2),
  EMAIL_TEMPLATE_SLO_CANARY_MAX_P95_LATENCY_MS: Joi.number().default(900),
  EMAIL_TEMPLATE_SLO_CANARY_MIN_SAMPLE_SIZE: Joi.number().default(10),
  EMAIL_TEMPLATE_SLO_CANARY_ALERT_AFTER_BREACHES: Joi.number().default(1),

  // ── Circuit breaker ──────────────────────────────────────────────────
  CB_FAILURE_THRESHOLD: Joi.number().default(3),
  CB_COOLDOWN_SECONDS: Joi.number().default(60),
  CB_PROBE_SUCCESS_THRESHOLD: Joi.number().default(2),

  // ── Throttle / Rate limit ────────────────────────────────────────────
  THROTTLE_TTL: Joi.number().default(900),
  THROTTLE_LIMIT: Joi.number().default(100),
  RATE_LIMIT_POST_MAX: Joi.number().default(5),
  RATE_LIMIT_POST_WINDOW: Joi.number().default(60),
  RATE_LIMIT_GET_MAX: Joi.number().default(50),
  RATE_LIMIT_GET_WINDOW: Joi.number().default(60),
  NOTIFICATION_DEDUPE_TTL_SECONDS: Joi.number().default(60),

  // ── DLQ retention ────────────────────────────────────────────────────
  DLQ_RETENTION_DAYS: Joi.number().default(14),
  DLQ_CLEANUP_BATCH_SIZE: Joi.number().default(100),
  DLQ_CLEANUP_DRY_RUN: Joi.string().valid('true', 'false').default('false'),

  // ── DLQ automatic replay (optional) ────────────────────────────────
  DLQ_AUTO_REPLAY_ENABLED: Joi.string().valid('true', 'false').default('false'),
  DLQ_AUTO_REPLAY_INTERVAL_MS: Joi.number().default(1800000), // 30 min
  DLQ_AUTO_REPLAY_LOOKBACK_MINUTES: Joi.number().default(15),
  DLQ_AUTO_REPLAY_MAX_JOBS_PER_RUN: Joi.number().default(50),

  // ── Redis queue health ──────────────────────────────────────────────
  REDIS_QUEUE_LATENCY_THRESHOLD_MS: Joi.number().default(250),
}).options({ allowUnknown: true, abortEarly: false });
