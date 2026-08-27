import { registerAs } from '@nestjs/config';
import {
  EmailTemplateActiveVersionMissingError,
  EmailTemplateNotFoundError,
  EmailTemplateVersionNotFoundError,
} from '../email/email-template.errors';

// Template registry structure
export type TemplateVariablePrimitiveType = 'string' | 'number' | 'boolean';

export interface EmailTemplateVariableSchema {
  required: Record<string, TemplateVariablePrimitiveType>;
  optional?: Record<string, TemplateVariablePrimitiveType>;
}

export interface EmailTemplateVersion {
  version: string;
  subject: string;
  html: string;
  text: string;
  requiredVars: string[];
  variableSchema?: EmailTemplateVariableSchema;
  lifecycleState: 'draft' | 'canary' | 'active' | 'deprecated' | 'archived';
}

export interface EmailTemplateRollout {
  canaryVersion?: string;
  canaryWeight?: number; // 0-100
  killSwitchEnabled?: boolean;
}

export interface EmailTemplateRegistry {
  [templateKey: string]: {
    activeVersion: string;
    versions: Record<string, EmailTemplateVersion>;
    rollout?: EmailTemplateRollout;
  };
}

/** Alias matching the name used in email.service.ts */
export type TemplateRegistry = EmailTemplateRegistry;

export interface TemplateRolloutPolicy {
  activeVersion: string;
  canaryVersion?: string;
  canaryPercent?: number;
}

export interface TemplateRolloutMap {
  [templateKey: string]: TemplateRolloutPolicy;
}

/**
 * Resolve which template version to use for a given recipient.
 * Uses the rolloutMap for explicit per-key overrides, then falls back
 * to the registry's built-in rollout config.
 */
export function resolveTemplate(
  registry: TemplateRegistry,
  rolloutMap: TemplateRolloutMap,
  templateKey: string,
  _recipientEmail: string,
): { template: EmailTemplateVersion; isCanary: boolean } {
  const reg = registry[templateKey];
  if (!reg) {
    throw new EmailTemplateNotFoundError(templateKey);
  }

  // Prefer per-key rollout override from rolloutMap
  const policy = rolloutMap[templateKey];
  const canaryKey = policy?.canaryVersion ?? reg.rollout?.canaryVersion;
  const canaryPct = policy?.canaryPercent ?? reg.rollout?.canaryWeight ?? 0;
  const activeKey = policy?.activeVersion ?? reg.activeVersion;
  const killSwitch = reg.rollout?.killSwitchEnabled ?? false;

  const activeVersion = reg.versions[activeKey];
  const canaryVersion = canaryKey ? reg.versions[canaryKey] : undefined;

  if (
    !killSwitch &&
    canaryVersion &&
    canaryVersion.lifecycleState === 'canary'
  ) {
    if (Math.random() * 100 < canaryPct) {
      return { template: canaryVersion, isCanary: true };
    }
  }

  if (!activeVersion) {
    if (activeKey) {
      throw new EmailTemplateVersionNotFoundError(templateKey, activeKey);
    }
    throw new EmailTemplateActiveVersionMissingError(
      templateKey,
      String(reg.activeVersion),
    );
  }
  return { template: activeVersion, isCanary: false };
}

export interface MailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  from: string;
  testAccount?: {
    user?: string;
    pass?: string;
  };
}

export interface EmailProviderConfig {
  primary: MailConfig;
  fallback?: MailConfig;
  globalKillSwitch: boolean;
  templateRegistry: EmailTemplateRegistry;
  slo: EmailTemplateSloConfig;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  cooldownSeconds: number;
  probeSuccessThreshold: number;
}

export interface TemplateVersionSloThreshold {
  maxErrorRatePercent: number;
  maxP95LatencyMs: number;
  minSampleSize: number;
  alertAfterConsecutiveBreaches: number;
}

export interface EmailTemplateSloConfig {
  evaluationWindowMinutes: number;
  active: TemplateVersionSloThreshold;
  canary: TemplateVersionSloThreshold;
}

// Example registry (should be loaded from DB or config in production)
const templateRegistry: EmailTemplateRegistry = {
  welcome: {
    activeVersion: 'v1',
    versions: {
      v1: {
        version: 'v1',
        subject: 'Welcome to XConfess! 🎉',
        html: '<h1>Welcome, {{username}}!</h1>',
        text: 'Welcome, {{username}}!',
        requiredVars: ['username'],
        variableSchema: {
          required: {
            username: 'string',
          },
        },
        lifecycleState: 'active',
      },
      v2: {
        version: 'v2',
        subject: 'Hello from XConfess!',
        html: '<h1>Hello, {{username}}! Enjoy XConfess.</h1>',
        text: 'Hello, {{username}}! Enjoy XConfess.',
        requiredVars: ['username'],
        variableSchema: {
          required: {
            username: 'string',
          },
        },
        lifecycleState: 'canary',
      },
    },
    rollout: {
      canaryVersion: 'v2',
      canaryWeight: parseInt(
        process.env.EMAIL_WELCOME_CANARY_WEIGHT || '0',
        10,
      ),
      killSwitchEnabled: false,
    },
  },
  reaction_notification: {
    activeVersion: 'v1',
    versions: {
      v1: {
        version: 'v1',
        subject: 'Someone reacted with {{emoji}} to your confession!',
        html: '<p><strong>{{reactorName}}</strong> reacted with {{emoji}} to your confession: "{{confessionContent}}"</p>',
        text: '{{reactorName}} reacted with {{emoji}} to your confession: "{{confessionContent}}"',
        requiredVars: ['username', 'reactorName', 'emoji', 'confessionContent'],
        variableSchema: {
          required: {
            username: 'string',
            reactorName: 'string',
            emoji: 'string',
            confessionContent: 'string',
          },
        },
        lifecycleState: 'active',
      },
    },
  },
  password_reset: {
    activeVersion: 'v1',
    versions: {
      v1: {
        version: 'v1',
        subject: 'Reset Your XConfess Password',
        html: '<p>Hello {{username}}, reset your password here: <a href="{{resetUrl}}">{{resetUrl}}</a>. Token: {{token}}</p>',
        text: 'Hello {{username}}, reset your password: {{resetUrl}}. Token: {{token}}',
        requiredVars: ['username', 'resetUrl', 'token'],
        variableSchema: {
          required: {
            username: 'string',
            resetUrl: 'string',
            token: 'string',
          },
        },
        lifecycleState: 'active',
      },
    },
  },
  comment_notification: {
    activeVersion: 'v1',
    versions: {
      v1: {
        version: 'v1',
        subject: 'New Comment on Your Confession',
        html: '<h2>Someone commented on your confession!</h2><blockquote>{{commentPreview}}</blockquote><a href="{{frontendUrl}}/confessions/{{confessionId}}">View Confession</a>',
        text: 'Someone commented on your confession: {{commentPreview}}. View: {{frontendUrl}}/confessions/{{confessionId}}',
        requiredVars: ['confessionId', 'commentPreview', 'frontendUrl'],
        variableSchema: {
          required: {
            confessionId: 'string',
            commentPreview: 'string',
            frontendUrl: 'string',
          },
        },
        lifecycleState: 'active',
      },
    },
  },
};

const templateSloConfig: EmailTemplateSloConfig = {
  evaluationWindowMinutes: parseInt(
    process.env.EMAIL_TEMPLATE_SLO_WINDOW_MINUTES || '15',
    10,
  ),
  active: {
    maxErrorRatePercent: parseFloat(
      process.env.EMAIL_TEMPLATE_SLO_ACTIVE_MAX_ERROR_RATE_PERCENT || '5',
    ),
    maxP95LatencyMs: parseInt(
      process.env.EMAIL_TEMPLATE_SLO_ACTIVE_MAX_P95_LATENCY_MS || '1200',
      10,
    ),
    minSampleSize: parseInt(
      process.env.EMAIL_TEMPLATE_SLO_ACTIVE_MIN_SAMPLE_SIZE || '20',
      10,
    ),
    alertAfterConsecutiveBreaches: parseInt(
      process.env.EMAIL_TEMPLATE_SLO_ACTIVE_ALERT_AFTER_BREACHES || '2',
      10,
    ),
  },
  canary: {
    maxErrorRatePercent: parseFloat(
      process.env.EMAIL_TEMPLATE_SLO_CANARY_MAX_ERROR_RATE_PERCENT || '2',
    ),
    maxP95LatencyMs: parseInt(
      process.env.EMAIL_TEMPLATE_SLO_CANARY_MAX_P95_LATENCY_MS || '900',
      10,
    ),
    minSampleSize: parseInt(
      process.env.EMAIL_TEMPLATE_SLO_CANARY_MIN_SAMPLE_SIZE || '10',
      10,
    ),
    alertAfterConsecutiveBreaches: parseInt(
      process.env.EMAIL_TEMPLATE_SLO_CANARY_ALERT_AFTER_BREACHES || '1',
      10,
    ),
  },
};

export const mailConfig = registerAs('mail', () => ({
  primary: {
    host: process.env.MAIL_HOST || 'smtp.ethereal.email',
    port: parseInt(process.env.MAIL_PORT || '587', 10),
    secure: process.env.MAIL_SECURE === 'true',
    auth: {
      user: process.env.MAIL_USER || '',
      pass: process.env.MAIL_PASSWORD || '',
    },
    from: process.env.MAIL_FROM || 'noreply@xconfess.app',
    testAccount: {
      user: process.env.MAIL_TEST_USER,
      pass: process.env.MAIL_TEST_PASS,
    },
  },
  ...(process.env.MAIL_FALLBACK_HOST
    ? {
        fallback: {
          host: process.env.MAIL_FALLBACK_HOST,
          port: parseInt(process.env.MAIL_FALLBACK_PORT || '587', 10),
          secure: process.env.MAIL_FALLBACK_SECURE === 'true',
          auth: {
            user: process.env.MAIL_FALLBACK_USER || '',
            pass: process.env.MAIL_FALLBACK_PASSWORD || '',
          },
          from: process.env.MAIL_FALLBACK_FROM || 'noreply@xconfess.app',
        } as MailConfig,
      }
    : {}),
  templateRegistry,
  globalKillSwitch: process.env.EMAIL_ROLLOUT_KILLSWITCH === 'true',
  slo: templateSloConfig,
}));

export const circuitBreakerConfig = registerAs('circuitBreaker', () => ({
  failureThreshold: parseInt(process.env.CB_FAILURE_THRESHOLD || '3', 10),
  cooldownSeconds: parseInt(process.env.CB_COOLDOWN_SECONDS || '60', 10),
  probeSuccessThreshold: parseInt(
    process.env.CB_PROBE_SUCCESS_THRESHOLD || '2',
    10,
  ),
}));
