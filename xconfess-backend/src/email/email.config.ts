import * as crypto from 'crypto';

export interface MailAuth {
  user: string;
  pass: string;
}

export interface MailConfig {
  host: string;
  port: number;
  secure: boolean;
  from: string;
  auth: MailAuth;
}

export interface EmailProviderConfig {
  primary: MailConfig;
  fallback?: MailConfig;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  cooldownSeconds: number;
  probeSuccessThreshold: number;
}

// ── Template versioning ───────────────────────────────────────────────────────

export interface EmailTemplateVersion {
  version: string;
  subject: string;
  html: string;
  text: string;
  requiredVars: string[];
}

/**
 * Rollout policy for a single template key.
 *
 * - `activeVersion`  – the stable version sent to the majority of recipients.
 * - `canaryVersion`  – optional; the version under test.
 * - `canaryPercent`  – 0–100.  0 or absent means canary is disabled.
 *                      100 means all traffic goes to canary (promotion).
 *
 * Routing is deterministic: the same recipient always gets the same version
 * within a rollout window, avoiding flickering UX.
 */
export interface TemplateRolloutPolicy {
  activeVersion: string;
  canaryVersion?: string;
  canaryPercent?: number; // 0–100, default 0
}

/**
 * Registry: templateKey → list of available versions
 */
export type TemplateRegistry = Record<string, EmailTemplateVersion[]>;

/**
 * Rollout map: templateKey → rollout policy
 */
export type TemplateRolloutMap = Record<string, TemplateRolloutPolicy>;

// ── Resolution helpers ────────────────────────────────────────────────────────

/**
 * Bucket configuration options
 */
export interface BucketConfig {
  /**
   * Optional salt for hash normalization.
   * When provided, the salt is prepended to the recipient email
   * before hashing to ensure additional stability across deployments.
   * Default: undefined (no salt)
   */
  salt?: string;
}

/**
 * Normalize recipient input for bucketing.
 *
 * Steps:
 * 1. Trim whitespace
 * 2. Convert to lowercase
 * 3. Return stable identifier
 */
export function normalizeRecipientForBucketing(recipientEmail: string): string {
  return recipientEmail.trim().toLowerCase();
}

/**
 * Deterministically assign a recipient to a bucket 0–99.
 *
 * Uses HMAC-SHA256 keyed on templateKey so the same email produces
 * different buckets for different templates (avoids correlated rollouts).
 *
 * @param recipientEmail - The recipient email (will be normalized)
 * @param templateKey - The template key to use as HMAC key
 * @param config - Optional bucket configuration (salt, etc.)
 * @returns Bucket number 0-99
 */
export function recipientBucket(
  recipientEmail: string,
  templateKey: string,
  config?: BucketConfig,
): number {
  // Normalize recipient: trim and lowercase
  const normalized = normalizeRecipientForBucketing(recipientEmail);

  // Apply optional salt if provided
  const input = config?.salt ? `${config.salt}${normalized}` : normalized;

  const hash = crypto
    .createHmac('sha256', templateKey)
    .update(input)
    .digest('hex');
  // Use the first 4 bytes (8 hex chars) for good distribution
  const value = parseInt(hash.slice(0, 8), 16);
  return value % 100;
}

/**
 * Resolve which template version to use for a given recipient.
 *
 * Rules:
 *  1. If no rollout policy → use activeVersion.
 *  2. canaryPercent === 0 or canaryVersion absent → use activeVersion.
 *  3. canaryPercent === 100 → use canaryVersion (full promotion).
 *  4. Otherwise → deterministic bucket routing.
 */
export function resolveTemplateVersion(
  templateKey: string,
  recipientEmail: string,
  rolloutMap: TemplateRolloutMap,
): { version: string; isCanary: boolean } {
  const policy = rolloutMap[templateKey];

  if (!policy) {
    // No rollout configured → default to v1
    return { version: 'v1', isCanary: false };
  }

  const { activeVersion, canaryVersion, canaryPercent = 0 } = policy;

  // Canary disabled
  if (!canaryVersion || canaryPercent <= 0) {
    return { version: activeVersion, isCanary: false };
  }

  // Full promotion
  if (canaryPercent >= 100) {
    return { version: canaryVersion, isCanary: false };
  }

  // Deterministic routing
  const bucket = recipientBucket(recipientEmail, templateKey);
  const isCanary = bucket < canaryPercent;

  return {
    version: isCanary ? canaryVersion : activeVersion,
    isCanary,
  };
}

/**
 * Look up a specific template version from the registry.
 * Throws if templateKey or version is not found.
 */
export function getTemplateVersion(
  registry: TemplateRegistry,
  templateKey: string,
  version: string,
): EmailTemplateVersion {
  const versions = registry[templateKey];
  if (!versions?.length) {
    throw new Error(`No templates registered for key: ${templateKey}`);
  }
  const tpl = versions.find((v) => v.version === version);
  if (!tpl) {
    throw new Error(
      `Template version '${version}' not found for key '${templateKey}'. ` +
        `Available: ${versions.map((v) => v.version).join(', ')}`,
    );
  }
  return tpl;
}

/**
 * Convenience: resolve version and return the template object in one call.
 */
export function resolveTemplate(
  registry: TemplateRegistry,
  rolloutMap: TemplateRolloutMap,
  templateKey: string,
  recipientEmail: string,
): { template: EmailTemplateVersion; isCanary: boolean } {
  const { version, isCanary } = resolveTemplateVersion(
    templateKey,
    recipientEmail,
    rolloutMap,
  );
  const template = getTemplateVersion(registry, templateKey, version);
  return { template, isCanary };
}

// ── Config factory ────────────────────────────────────────────────────────────

export const emailConfig = (): {
  mail: EmailProviderConfig;
  circuitBreaker: CircuitBreakerConfig;
} => ({
  mail: {
    primary: {
      host: process.env.MAIL_HOST ?? '',
      port: parseInt(process.env.MAIL_PORT ?? '587', 10),
      secure: process.env.MAIL_SECURE === 'true',
      from: process.env.MAIL_FROM ?? '',
      auth: {
        user: process.env.MAIL_USER ?? '',
        pass: process.env.MAIL_PASS ?? '',
      },
    },
    fallback: process.env.FALLBACK_MAIL_HOST
      ? {
          host: process.env.FALLBACK_MAIL_HOST,
          port: parseInt(process.env.FALLBACK_MAIL_PORT ?? '587', 10),
          secure: process.env.FALLBACK_MAIL_SECURE === 'true',
          from: process.env.FALLBACK_MAIL_FROM ?? '',
          auth: {
            user: process.env.FALLBACK_MAIL_USER ?? '',
            pass: process.env.FALLBACK_MAIL_PASS ?? '',
          },
        }
      : undefined,
  },
  circuitBreaker: {
    failureThreshold: parseInt(process.env.CB_FAILURE_THRESHOLD ?? '3', 10),
    cooldownSeconds: parseInt(process.env.CB_COOLDOWN_SECONDS ?? '60', 10),
    probeSuccessThreshold: parseInt(
      process.env.CB_PROBE_SUCCESS_THRESHOLD ?? '2',
      10,
    ),
  },
});
