import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../logger/logger.service';
import {
  AuditLogService,
  TemplateRolloutSourceMetadata,
} from '../audit-log/audit-log.service';
import { AuditActionType } from '../audit-log/audit-log.entity';
import { UserIdMasker } from '../utils/mask-user-id';
import {
  CircuitBreakerConfig,
  EmailProviderConfig,
  MailConfig,
  EmailTemplateVersion,
  EmailTemplateSloConfig,
  TemplateVariablePrimitiveType,
  TemplateRegistry,
  TemplateRolloutMap,
  resolveTemplate,
} from '../config/email.config';
import {
  EmailTemplateError,
  EmailTemplateNotFoundError,
} from './email-template.errors';

// ── Template variable validation ──────────────────────────────────────────────

export type TemplateVariableValidationViolationCode =
  | 'missing'
  | 'unknown'
  | 'type_mismatch';

export interface TemplateVariableValidationViolation {
  code: TemplateVariableValidationViolationCode;
  key: string;
  expected: string;
  actual: string;
}

export class TemplateVariableValidationError extends Error {
  readonly code = 'template_variable_validation_error';

  constructor(
    readonly templateKey: string,
    readonly templateVersion: string,
    readonly violations: TemplateVariableValidationViolation[],
  ) {
    super(
      `Template variable validation failed for ${templateKey}@${templateVersion}`,
    );
  }

  toMetadata() {
    return {
      code: this.code,
      templateKey: this.templateKey,
      templateVersion: this.templateVersion,
      violations: this.violations,
    };
  }
}

function getActualType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function normalizeSchema(template: EmailTemplateVersion): {
  required: Record<string, TemplateVariablePrimitiveType>;
  optional: Record<string, TemplateVariablePrimitiveType>;
} {
  const required =
    template.variableSchema?.required ??
    Object.fromEntries(
      (template.requiredVars || []).map((key) => [key, 'string']),
    );

  return {
    required,
    optional: template.variableSchema?.optional || {},
  };
}

export function renderTemplate(
  templateKey: string,
  template: EmailTemplateVersion,
  vars: Record<string, unknown>,
): { subject: string; html: string; text: string } {
  const schema = normalizeSchema(template);
  const allowedKeys = new Set([
    ...Object.keys(schema.required),
    ...Object.keys(schema.optional),
  ]);
  const violations: TemplateVariableValidationViolation[] = [];

  for (const [key, expectedType] of Object.entries(schema.required)) {
    const value = vars[key];
    if (value === undefined || value === null) {
      violations.push({
        code: 'missing',
        key,
        expected: expectedType,
        actual: value === null ? 'null' : 'undefined',
      });
      continue;
    }
    if (typeof value !== expectedType) {
      violations.push({
        code: 'type_mismatch',
        key,
        expected: expectedType,
        actual: getActualType(value),
      });
    }
  }

  for (const [key, value] of Object.entries(vars)) {
    if (!allowedKeys.has(key)) {
      violations.push({
        code: 'unknown',
        key,
        expected: 'not_allowed',
        actual: getActualType(value),
      });
      continue;
    }
    const expectedType = schema.optional[key];
    if (expectedType && value !== undefined && value !== null) {
      if (typeof value !== expectedType) {
        violations.push({
          code: 'type_mismatch',
          key,
          expected: expectedType,
          actual: getActualType(value),
        });
      }
    }
  }

  if (violations.length > 0) {
    throw new TemplateVariableValidationError(
      templateKey,
      template.version,
      violations,
    );
  }

  const replaceVars = (str: string) =>
    str.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, k) =>
      vars[k] === undefined || vars[k] === null ? '' : String(vars[k]),
    );

  return {
    subject: replaceVars(template.subject),
    html: replaceVars(template.html),
    text: replaceVars(template.text),
  };
}

// ── Circuit breaker types ─────────────────────────────────────────────────────

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerState {
  state: CircuitState;
  consecutiveFailures: number;
  consecutiveProbeSuccesses: number;
  openedAt: number | null;
  lastTransitionReason: string;
}

// ── Provider abstraction ──────────────────────────────────────────────────────

interface TransporterEntry {
  transporter: nodemailer.Transporter;
  from: string;
  label: 'primary' | 'fallback';
}

// ── Template meta attached to each send ──────────────────────────────────────

export interface TemplateMeta {
  templateKey: string;
  templateVersion: string;
  isCanary?: boolean;
}

export interface TemplatePreviewResult {
  templateKey: string;
  version: string;
  lifecycleState: string;
  rendered: { subject: string; html: string; text: string } | null;
  validationErrors: string[];
  missingVars: string[];
  requiredVars: string[];
}

// ── SLO tracking ─────────────────────────────────────────────────────────────

interface TemplateSloSeriesEntry {
  timestamp: number;
  success: boolean;
  durationMs: number;
}

interface TemplateSloSeries {
  entries: TemplateSloSeriesEntry[];
  breachCount: number;
  inBreach: boolean;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class EmailService implements OnModuleInit {
  /**
   * Sends a notification using the registered template key + rendered variables.
   * Throws typed/structured HTTP errors when a template or version is missing.
   */
  async sendGenericNotification(
    recipientEmail: string,
    templateKey: string,
    templateData: Record<string, unknown>,
  ): Promise<void> {
    const channel = `email_${templateKey}`;
    try {
      const rendered = this.resolveAndRender(
        templateKey,
        recipientEmail,
        templateData,
      );
      await this.sendEmail(
        recipientEmail,
        rendered.subject,
        rendered.html,
        rendered.text,
        channel,
        rendered.meta,
      );
    } catch (err) {
      if (err instanceof EmailTemplateError) {
        this.logger.error('Email template resolution failed', {
          code: err.code,
          templateKey: err.templateKey,
          templateVersion: err.templateVersion,
        });

        throw new NotFoundException({
          message: 'Email template not found',
          code: err.code,
          templateKey: err.templateKey,
          templateVersion: err.templateVersion,
        });
      }
      throw err;
    }
  }
  private readonly logger = new Logger(EmailService.name);

  private primary: TransporterEntry | null = null;
  private fallback: TransporterEntry | null = null;

  private readonly cb: CircuitBreakerState = {
    state: 'CLOSED',
    consecutiveFailures: 0,
    consecutiveProbeSuccesses: 0,
    openedAt: null,
    lastTransitionReason: 'initial',
  };

  private cbConfig: CircuitBreakerConfig = {
    failureThreshold: 3,
    cooldownSeconds: 60,
    probeSuccessThreshold: 2,
  };

  private templateSloConfig: EmailTemplateSloConfig = {
    evaluationWindowMinutes: 15,
    active: {
      maxErrorRatePercent: 5,
      maxP95LatencyMs: 1200,
      minSampleSize: 20,
      alertAfterConsecutiveBreaches: 2,
    },
    canary: {
      maxErrorRatePercent: 2,
      maxP95LatencyMs: 900,
      minSampleSize: 10,
      alertAfterConsecutiveBreaches: 1,
    },
  };

  private readonly templateSloSeries = new Map<string, TemplateSloSeries>();

  private templateRegistry: TemplateRegistry = {};
  private rolloutMap: TemplateRolloutMap = {};

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly auditLogService?: AuditLogService,
    @Optional() private readonly appLogger?: AppLogger,
  ) {}

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  onModuleInit() {
    const mailConfig = this.configService.get<EmailProviderConfig>('mail');
    const cbConfig =
      this.configService.get<CircuitBreakerConfig>('circuitBreaker');

    if (cbConfig) this.cbConfig = cbConfig;

    const registry =
      this.configService.get<TemplateRegistry>('templateRegistry');
    const rollout =
      this.configService.get<TemplateRolloutMap>('templateRolloutMap');
    if (registry) this.templateRegistry = registry;
    if (rollout) this.rolloutMap = rollout;

    if (mailConfig?.slo) {
      this.templateSloConfig = mailConfig.slo;
    }

    const isDev =
      !process.env.NODE_ENV ||
      ['development', 'dev', 'local'].includes(process.env.NODE_ENV);

    if (!mailConfig?.primary?.host) {
      const msg =
        'No primary mail config found — using Ethereal test account.';
      if (isDev) {
        this.logger.log(msg);
      } else {
        this.logger.warn(msg);
      }
      this.initEtherealFallback();
      return;
    }

    this.primary = this.buildTransporter(mailConfig.primary, 'primary');

    if (mailConfig.fallback?.host) {
      this.fallback = this.buildTransporter(mailConfig.fallback, 'fallback');
      this.logger.log('Fallback email provider configured.');
    } else {
      const msg =
        'No fallback email provider configured. Circuit breaker will have no fallback.';
      if (isDev) {
        this.logger.log(msg);
      } else {
        this.logger.warn(msg);
      }
    }
  }

  // ── Template lifecycle management ─────────────────────────────────────────

  private readonly validTransitions: Record<string, string[]> = {
    draft: ['canary', 'active', 'archived'],
    canary: ['active', 'deprecated', 'archived'],
    active: ['deprecated', 'archived'],
    deprecated: ['active', 'archived'],
    archived: ['draft'],
  };

  async transitionTemplateState(
    templateKey: string,
    version: string,
    nextState: 'draft' | 'canary' | 'active' | 'deprecated' | 'archived',
    adminId: string,
    reason?: string,
    source?: TemplateRolloutSourceMetadata,
  ): Promise<void> {
    const reg = this.templateRegistry?.[templateKey];
    const template = reg?.versions[version];

    if (!template) {
      this.logger.error('Email template version not found', {
        templateKey,
        templateVersion: version,
      });
      throw new NotFoundException({
        message: 'Email template version not found',
        templateKey,
        templateVersion: version,
        code: 'template_version_not_found',
      });
    }

    const currentState = template.lifecycleState;
    const allowed = this.validTransitions[currentState] || [];

    if (!allowed.includes(nextState)) {
      throw new Error(
        `Invalid transition: ${currentState} -> ${nextState} for ${templateKey} v${version}`,
      );
    }

    template.lifecycleState = nextState;

    await this.auditLogService?.logTemplateStateTransition(
      templateKey,
      version,
      currentState,
      nextState,
      adminId,
      reason,
      source,
    );

    this.logger.log(
      `Template ${templateKey} v${version} transitioned: ${currentState} -> ${nextState} (by admin ${adminId})`,
    );
  }

  async setActiveTemplateVersion(
    templateKey: string,
    version: string,
    actorId = 'system',
    reason?: string,
    source?: TemplateRolloutSourceMetadata,
  ): Promise<void> {
    const reg = this.templateRegistry?.[templateKey];
    if (!reg?.versions[version]) {
      this.logger.error('Email template or version not found', {
        templateKey,
        templateVersion: version,
      });
      throw new NotFoundException({
        message: 'Email template not found',
        templateKey,
        templateVersion: version,
        code: 'template_version_not_found',
      });
    }

    const before = {
      activeVersion: reg.activeVersion,
      rollout: reg.rollout || {},
    };
    reg.activeVersion = version;
    const after = {
      activeVersion: reg.activeVersion,
      rollout: reg.rollout || {},
    };

    await this.auditLogService?.logTemplateRolloutDiff({
      templateKey,
      templateVersion: version,
      changeType: 'active_version_switch',
      actorId,
      before,
      after,
      source: { reason, ...source },
    });

    this.logger.log(`Switched ${templateKey} template to version ${version}`);
  }

  async updateTemplateCanaryRollout(
    templateKey: string,
    actorId: string,
    options: {
      canaryVersion?: string;
      canaryWeight?: number;
      reason?: string;
      source?: TemplateRolloutSourceMetadata;
    },
  ): Promise<void> {
    const reg = this.templateRegistry?.[templateKey];
    if (!reg) {
      this.logger.error('Email template not found', { templateKey });
      throw new NotFoundException({
        message: 'Email template not found',
        templateKey,
        code: 'template_not_found',
      });
    }

    const before = {
      activeVersion: reg.activeVersion,
      rollout: reg.rollout || {},
    };

    reg.rollout = {
      ...(reg.rollout || {}),
      ...(options.canaryVersion !== undefined
        ? { canaryVersion: options.canaryVersion }
        : {}),
      ...(options.canaryWeight !== undefined
        ? { canaryWeight: options.canaryWeight }
        : {}),
    };

    const after = {
      activeVersion: reg.activeVersion,
      rollout: reg.rollout || {},
    };

    await this.auditLogService?.logTemplateRolloutDiff({
      templateKey,
      templateVersion: options.canaryVersion || reg.activeVersion,
      changeType: 'canary_update',
      actorId,
      before,
      after,
      source: { reason: options.reason, ...options.source },
    });
  }

  async setTemplateKillSwitch(
    actorId: string,
    enabled: boolean,
    templateKey?: string,
    reason?: string,
    source?: TemplateRolloutSourceMetadata,
  ): Promise<void> {
    if (templateKey) {
      const reg = this.templateRegistry?.[templateKey];
      if (!reg) {
        this.logger.error('Email template not found', { templateKey });
        throw new NotFoundException({
          message: 'Email template not found',
          templateKey,
          code: 'template_not_found',
        });
      }

      const before = { rollout: reg.rollout || {} };
      reg.rollout = { ...(reg.rollout || {}), killSwitchEnabled: enabled };
      const after = { rollout: reg.rollout || {} };

      await this.auditLogService?.logTemplateRolloutDiff({
        templateKey,
        templateVersion: reg.activeVersion,
        changeType: 'kill_switch_toggle',
        actorId,
        before,
        after,
        source: { reason, ...source },
      });
    }

    await this.auditLogService?.logTemplateKillswitchToggle(
      actorId,
      enabled,
      templateKey,
      reason,
      source,
    );
  }

  async getTemplateRolloutHistory(options: {
    templateKey?: string;
    templateVersion?: string;
    actorId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }) {
    return this.auditLogService?.getTemplateRolloutHistory(options);
  }

  // ── Rollout policy management ─────────────────────────────────────────────

  updateRolloutMap(updates: TemplateRolloutMap): void {
    this.rolloutMap = { ...this.rolloutMap, ...updates };
    this.logger.log(
      `Template rollout map updated: ${JSON.stringify(
        Object.entries(updates).map(([k, v]) => ({
          key: k,
          active: v.activeVersion,
          canary: v.canaryVersion,
          pct: v.canaryPercent ?? 0,
        })),
      )}`,
    );
  }

  promoteCanary(templateKey: string): void {
    const policy = this.rolloutMap[templateKey];

    if (!policy?.canaryVersion) {
      this.logger.warn(`No canary configured for ${templateKey}`);
      return;
    }

    this.rolloutMap[templateKey] = { activeVersion: policy.canaryVersion };

    this.auditLogService?.log({
      actionType: AuditActionType.EMAIL_TEMPLATE_PROMOTED,
      metadata: {
        templateKey,
        newActiveVersion: policy.canaryVersion,
        promotedAt: new Date().toISOString(),
      },
    });

    this.logger.log(
      `Template '${templateKey}' promoted to ${policy.canaryVersion}`,
    );
  }

  rollbackCanary(templateKey: string): void {
    const policy = this.rolloutMap[templateKey];
    if (!policy) return;

    this.rolloutMap[templateKey] = { activeVersion: policy.activeVersion };

    this.auditLogService?.log({
      actionType: AuditActionType.EMAIL_TEMPLATE_ROLLED_BACK,
      metadata: {
        templateKey,
        activeVersion: policy.activeVersion,
        rolledBackAt: new Date().toISOString(),
      },
    });

    this.logger.warn(`Canary rolled back for ${templateKey}`);
  }

  getRolloutMap(): Readonly<TemplateRolloutMap> {
    return this.rolloutMap;
  }

  // ── Template resolution ───────────────────────────────────────────────────

  private resolveActiveTemplate(
    key: string,
  ): { template: EmailTemplateVersion; isCanary: boolean } | undefined {
    const reg = this.templateRegistry?.[key];
    if (!reg) return undefined;

    const globalKillSwitch = this.configService.get<boolean>(
      'mail.globalKillSwitch',
    );
    const localKillSwitch = reg.rollout?.killSwitchEnabled === true;
    const isKillSwitchActive = globalKillSwitch || localKillSwitch;

    const activeVersion = reg.versions[reg.activeVersion];
    const canaryVersionKey = reg.rollout?.canaryVersion;
    const canaryVersion = canaryVersionKey
      ? reg.versions[canaryVersionKey]
      : undefined;

    if (isKillSwitchActive) {
      if (canaryVersion) {
        this.logger.warn(
          `Kill-switch active for ${key}: forcing fallback from canary ${canaryVersionKey} to active ${reg.activeVersion}`,
        );
        this.auditLogService
          ?.logTemplateFallbackActivated(
            key,
            canaryVersionKey || 'unknown',
            reg.activeVersion,
            globalKillSwitch ? 'global_killswitch' : 'local_killswitch',
          )
          .catch(() => undefined);
      }
      return activeVersion
        ? { template: activeVersion, isCanary: false }
        : undefined;
    }

    if (canaryVersion && canaryVersion.lifecycleState === 'canary') {
      const weight = reg.rollout?.canaryWeight ?? 0;
      if (Math.random() * 100 < weight) {
        return { template: canaryVersion, isCanary: true };
      }
    }

    if (activeVersion && activeVersion.lifecycleState === 'active') {
      return { template: activeVersion, isCanary: false };
    }

    if (activeVersion) {
      this.logger.warn(
        `Template ${key} active version ${reg.activeVersion} is in state ${activeVersion.lifecycleState}`,
      );
      return { template: activeVersion, isCanary: false };
    }

    return undefined;
  }

  resolveAndRender(
    templateKey: string,
    recipientEmail: string,
    vars: Record<string, unknown>,
  ): { subject: string; html: string; text: string; meta: TemplateMeta } {
    let template;
    let isCanary = false;
    try {
      ({ template, isCanary } = resolveTemplate(
        this.templateRegistry,
        this.rolloutMap,
        templateKey,
        recipientEmail,
      ));
    } catch (err) {
      if (err instanceof EmailTemplateError) {
        this.logger.error('Email template resolution failed', {
          code: err.code,
          templateKey: err.templateKey,
          templateVersion: err.templateVersion,
        });
        throw new NotFoundException({
          message: 'Email template not found',
          code: err.code,
          templateKey: err.templateKey,
          templateVersion: err.templateVersion,
        });
      }
      throw err;
    }
    const rendered = renderTemplate(templateKey, template, vars);
    return {
      ...rendered,
      meta: { templateKey, templateVersion: template.version, isCanary },
    };
  }

  // ── SLO evaluation ────────────────────────────────────────────────────────

  private buildTemplateMetricLabels(
    base: Record<string, string>,
    templateMeta?: TemplateMeta,
  ): Record<string, string> {
    if (!templateMeta) return base;
    return {
      ...base,
      template_key: templateMeta.templateKey,
      template_version: templateMeta.templateVersion,
      template_track: templateMeta.isCanary ? 'canary' : 'active',
    };
  }

  private computeP95(entries: TemplateSloSeriesEntry[]): number {
    if (entries.length === 0) return 0;
    const sorted = [...entries].map((e) => e.durationMs).sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * 0.95) - 1;
    return sorted[Math.max(0, index)];
  }

  private evaluateTemplateSlo(
    templateMeta: TemplateMeta | undefined,
    success: boolean,
    durationMs: number,
  ): void {
    if (!templateMeta) return;

    const key = `${templateMeta.templateKey}@${templateMeta.templateVersion}`;
    const now = Date.now();
    const windowMs = this.templateSloConfig.evaluationWindowMinutes * 60 * 1000;
    const existing = this.templateSloSeries.get(key) || {
      entries: [],
      breachCount: 0,
      inBreach: false,
    };

    existing.entries.push({ timestamp: now, success, durationMs });
    existing.entries = existing.entries.filter(
      (e) => now - e.timestamp <= windowMs,
    );

    const threshold = templateMeta.isCanary
      ? this.templateSloConfig.canary
      : this.templateSloConfig.active;
    const total = existing.entries.length;
    const failures = existing.entries.filter((e) => !e.success).length;
    const errorRatePercent = total > 0 ? (failures / total) * 100 : 0;
    const p95LatencyMs = this.computeP95(existing.entries);
    const shouldEvaluate = total >= threshold.minSampleSize;
    const breached =
      shouldEvaluate &&
      (errorRatePercent > threshold.maxErrorRatePercent ||
        p95LatencyMs > threshold.maxP95LatencyMs);

    if (breached) {
      existing.breachCount += 1;
      const payload = {
        templateKey: templateMeta.templateKey,
        templateVersion: templateMeta.templateVersion,
        track: templateMeta.isCanary ? 'canary' : 'active',
        sampleSize: total,
        failures,
        errorRatePercent: Number(errorRatePercent.toFixed(2)),
        p95LatencyMs: Number(p95LatencyMs.toFixed(2)),
        thresholds: {
          maxErrorRatePercent: threshold.maxErrorRatePercent,
          maxP95LatencyMs: threshold.maxP95LatencyMs,
          minSampleSize: threshold.minSampleSize,
          alertAfterConsecutiveBreaches:
            threshold.alertAfterConsecutiveBreaches,
        },
      };

      this.appLogger?.emitWarningEvent(
        'template_version_slo_threshold_breached',
        payload,
        'EmailService',
      );

      if (existing.breachCount >= threshold.alertAfterConsecutiveBreaches) {
        this.appLogger?.emitAlertEvent(
          'template_version_slo_alert',
          { ...payload, breachCount: existing.breachCount },
          'EmailService',
        );
      }

      existing.inBreach = true;
    } else if (existing.inBreach) {
      this.appLogger?.emitEvent(
        'info',
        'template_version_slo_recovered',
        {
          templateKey: templateMeta.templateKey,
          templateVersion: templateMeta.templateVersion,
          track: templateMeta.isCanary ? 'canary' : 'active',
          sampleSize: total,
          failures,
          errorRatePercent: Number(errorRatePercent.toFixed(2)),
          p95LatencyMs: Number(p95LatencyMs.toFixed(2)),
        },
        'EmailService',
      );
      existing.inBreach = false;
      existing.breachCount = 0;
    } else {
      existing.breachCount = 0;
    }

    this.templateSloSeries.set(key, existing);
  }

  // ── Provider helpers ──────────────────────────────────────────────────────

  private buildTransporter(
    config: MailConfig,
    label: 'primary' | 'fallback',
  ): TransporterEntry {
    return {
      label,
      from: `"XConfess" <${config.from}>`,
      transporter: nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: { user: config.auth.user, pass: config.auth.pass },
      }),
    };
  }

  private initEtherealFallback(): void {
    nodemailer.createTestAccount().then((account) => {
      this.primary = {
        label: 'primary',
        from: `"XConfess" <${account.user}>`,
        transporter: nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: { user: account.user, pass: account.pass },
        }),
      };
      this.logger.log(
        'Ethereal test account ready. Preview at https://ethereal.email',
      );
    });
  }

  // ── Circuit breaker ───────────────────────────────────────────────────────

  private resolveProvider(): TransporterEntry | null {
    const { state, openedAt } = this.cb;
    const { cooldownSeconds } = this.cbConfig;

    if (state === 'CLOSED') return this.primary;

    if (state === 'OPEN') {
      const elapsed = Date.now() - (openedAt ?? 0);
      if (elapsed >= cooldownSeconds * 1000) {
        this.transitionTo('HALF_OPEN', 'cooldown_elapsed');
        return this.primary;
      }
      return this.fallback ?? null;
    }

    if (state === 'HALF_OPEN') return this.primary;

    return this.primary;
  }

  private onSendSuccess(provider: TransporterEntry): void {
    if (this.cb.state === 'HALF_OPEN') {
      this.cb.consecutiveProbeSuccesses += 1;
      if (
        this.cb.consecutiveProbeSuccesses >= this.cbConfig.probeSuccessThreshold
      ) {
        this.transitionTo(
          'CLOSED',
          `probe_success_threshold_reached provider=${provider.label}`,
        );
        this.cb.consecutiveFailures = 0;
        this.cb.consecutiveProbeSuccesses = 0;
      }
    } else if (this.cb.state === 'CLOSED') {
      this.cb.consecutiveFailures = 0;
    }
  }

  private onSendFailure(provider: TransporterEntry, error: Error): void {
    if (provider.label === 'fallback') {
      this.logger.error(`Fallback provider failed: ${error.message}`);
      return;
    }

    if (this.cb.state === 'HALF_OPEN') {
      this.cb.consecutiveProbeSuccesses = 0;
      this.transitionTo('OPEN', `probe_failed error=${error.message}`);
      this.cb.openedAt = Date.now();
      return;
    }

    if (this.cb.state === 'CLOSED') {
      this.cb.consecutiveFailures += 1;
      if (this.cb.consecutiveFailures >= this.cbConfig.failureThreshold) {
        this.cb.openedAt = Date.now();
        this.transitionTo(
          'OPEN',
          `failure_threshold_reached count=${this.cb.consecutiveFailures}`,
        );
      }
    }
  }

  private transitionTo(next: CircuitState, reason: string): void {
    const prev = this.cb.state;
    this.cb.state = next;
    this.cb.lastTransitionReason = reason;
    const msg = `Circuit breaker transition: ${prev} → ${next} | reason=${reason}`;
    if (next === 'OPEN') {
      this.logger.error(msg);
      this.appLogger?.incrementCounter('email_circuit_breaker_opened_total', 1);
    } else if (next === 'HALF_OPEN') {
      this.logger.warn(msg);
    } else {
      this.logger.log(msg);
      this.appLogger?.incrementCounter('email_circuit_breaker_closed_total', 1);
    }
  }

  // ── Core send ─────────────────────────────────────────────────────────────

  private async sendEmail(
    to: string,
    subject: string,
    html: string,
    text: string,
    channel = 'email_generic',
    templateMeta?: TemplateMeta,
  ): Promise<void> {
    const startedAt = Date.now();
    const provider = this.resolveProvider();

    if (!provider) {
      const reason = 'circuit_open_no_fallback';
      const maskedTo = UserIdMasker.maskObject({ email: to }).email;
      this.logger.error(
        `Email blocked — circuit OPEN, no fallback. to=${maskedTo} channel=${channel}`,
      );
      this.appLogger?.incrementCounter('notification_send_failure_total', 1, {
        ...this.buildTemplateMetricLabels(
          { channel, outcome: 'terminal', reason },
          templateMeta,
        ),
      });
      const err = new Error(`Email service unavailable: ${reason}`) as any;
      err.templateMeta = templateMeta;
      err.errorCode = 'email_service_unavailable';
      throw err;
    }

    if (!provider.transporter) {
      this.logger.warn(
        'Email transporter not initialized yet. Email not sent.',
      );
      this.appLogger?.incrementCounter('notification_send_failure_total', 1, {
        ...this.buildTemplateMetricLabels(
          {
            channel,
            outcome: 'terminal',
            reason: 'transporter_not_initialized',
          },
          templateMeta,
        ),
      });
      return;
    }

    const usingFallback = provider.label === 'fallback';
    if (usingFallback) {
      this.logger.warn(
        `Routing email via fallback provider | channel=${channel} circuit_state=${this.cb.state}`,
      );
      this.appLogger?.incrementCounter('email_fallback_send_total', 1, {
        ...this.buildTemplateMetricLabels({ channel }, templateMeta),
      });
    }

    try {
      const maskedTo = UserIdMasker.maskObject({ email: to }).email;
      const info = await provider.transporter.sendMail({
        from: provider.from,
        to,
        subject,
        html,
        text,
      });

      this.onSendSuccess(provider);

      this.appLogger?.incrementCounter('notification_send_success_total', 1, {
        ...this.buildTemplateMetricLabels(
          { channel, provider: provider.label },
          templateMeta,
        ),
      });
      this.appLogger?.observeTimer(
        'notification_send_duration_ms',
        Date.now() - startedAt,
        this.buildTemplateMetricLabels(
          { channel, provider: provider.label },
          templateMeta,
        ),
      );
      this.evaluateTemplateSlo(templateMeta, true, Date.now() - startedAt);

      if (templateMeta) {
        await this.auditLogService?.log({
          actionType: AuditActionType.EMAIL_TEMPLATE_DELIVERED,
          metadata: {
            templateKey: templateMeta.templateKey,
            templateVersion: templateMeta.templateVersion,
            isCanary: templateMeta.isCanary,
            provider: provider.label,
            channel,
            deliveredAt: new Date().toISOString(),
          },
        });
      }

      this.logger.log(
        `Email sent via ${provider.label} to ${maskedTo} | channel=${channel}` +
          (templateMeta
            ? ` | template=${templateMeta.templateKey}@${templateMeta.templateVersion}${templateMeta.isCanary ? '[canary]' : ''}`
            : ''),
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      this.onSendFailure(
        provider,
        error instanceof Error ? error : new Error(errorMessage),
      );

      this.appLogger?.incrementCounter('notification_send_failure_total', 1, {
        ...this.buildTemplateMetricLabels(
          { channel, outcome: 'transient', provider: provider.label },
          templateMeta,
        ),
      });
      this.appLogger?.observeTimer(
        'notification_send_duration_ms',
        Date.now() - startedAt,
        this.buildTemplateMetricLabels(
          { channel, provider: provider.label },
          templateMeta,
        ),
      );
      this.evaluateTemplateSlo(templateMeta, false, Date.now() - startedAt);

      if (templateMeta) {
        await this.auditLogService?.log({
          actionType: AuditActionType.EMAIL_TEMPLATE_FAILED,
          metadata: {
            templateKey: templateMeta.templateKey,
            templateVersion: templateMeta.templateVersion,
            isCanary: templateMeta.isCanary,
            provider: provider.label,
            channel,
            error: errorMessage,
            failedAt: new Date().toISOString(),
          },
        });
      }

      // Retry on fallback if primary failed and fallback is available
      if (!usingFallback && this.fallback) {
        this.logger.warn(
          `Primary send failed — retrying on fallback | channel=${channel} error=${errorMessage}`,
        );
        this.appLogger?.incrementCounter(
          'notification_retry_attempt_total',
          1,
          {
            ...this.buildTemplateMetricLabels(
              { channel, provider: provider.label, retry_mode: 'fallback' },
              templateMeta,
            ),
          },
        );
        return this.sendViaFallback(
          to,
          subject,
          html,
          text,
          channel,
          startedAt,
          templateMeta,
        );
      }

      const wrappedError = new Error(
        `Failed to send email: ${errorMessage}`,
      ) as any;
      wrappedError.templateMeta = templateMeta;
      wrappedError.errorCode = 'email_send_failed';
      throw wrappedError;
    }
  }

  private async sendViaFallback(
    to: string,
    subject: string,
    html: string,
    text: string,
    channel: string,
    startedAt: number,
    templateMeta?: TemplateMeta,
  ): Promise<void> {
    if (!this.fallback) return;

    try {
      const info = await this.fallback.transporter.sendMail({
        from: this.fallback.from,
        to,
        subject,
        html,
        text,
      });

      this.logger.log(
        `Email delivered via fallback (after primary failure) to ${to}: ${info.messageId} | channel=${channel}`,
      );
      this.appLogger?.incrementCounter('email_fallback_send_total', 1, {
        ...this.buildTemplateMetricLabels({ channel }, templateMeta),
      });
      this.appLogger?.incrementCounter('notification_send_success_total', 1, {
        ...this.buildTemplateMetricLabels(
          { channel, provider: 'fallback' },
          templateMeta,
        ),
      });
      this.appLogger?.observeTimer(
        'notification_send_duration_ms',
        Date.now() - startedAt,
        this.buildTemplateMetricLabels(
          { channel, provider: 'fallback' },
          templateMeta,
        ),
      );
      this.evaluateTemplateSlo(templateMeta, true, Date.now() - startedAt);
    } catch (fallbackError) {
      const msg =
        fallbackError instanceof Error
          ? fallbackError.message
          : 'Unknown error';
      this.logger.error(
        `Fallback also failed for ${to}: ${msg} | channel=${channel}`,
      );
      this.appLogger?.incrementCounter('notification_send_failure_total', 1, {
        ...this.buildTemplateMetricLabels(
          { channel, outcome: 'terminal', provider: 'fallback' },
          templateMeta,
        ),
      });
      this.evaluateTemplateSlo(templateMeta, false, Date.now() - startedAt);

      const wrappedError = new Error(
        `Both primary and fallback failed: ${msg}`,
      ) as any;
      wrappedError.templateMeta = templateMeta;
      wrappedError.errorCode = 'email_send_failed_all_providers';
      throw wrappedError;
    }
  }

  // ── Circuit breaker diagnostics ───────────────────────────────────────────

  getCircuitState(): {
    state: CircuitState;
    reason: string;
    openedAt: string | null;
  } {
    return {
      state: this.cb.state,
      reason: this.cb.lastTransitionReason,
      openedAt: this.cb.openedAt
        ? new Date(this.cb.openedAt).toISOString()
        : null,
    };
  }

  // ── Template preview ─────────────────────────────────────────────────────

  previewTemplate(
    templateKey: string,
    vars: Record<string, string>,
    version?: string,
  ): TemplatePreviewResult {
    const reg = this.templateRegistry?.[templateKey];
    if (!reg) {
      this.logger.error('Email template not found', { templateKey });
      throw new NotFoundException({
        message: 'Email template not found',
        templateKey,
        code: 'template_not_found',
      });
    }

    const targetVersion = version ?? reg.activeVersion;
    const template = reg.versions?.[targetVersion];
    if (!template) {
      this.logger.error('Email template version not found', {
        templateKey,
        templateVersion: targetVersion,
      });
      throw new NotFoundException({
        message: 'Email template version not found',
        templateKey,
        templateVersion: targetVersion,
        code: 'template_version_not_found',
      });
    }

    const requiredVars = template.requiredVars || [];
    try {
      const rendered = renderTemplate(templateKey, template, vars);
      return {
        templateKey,
        version: template.version,
        lifecycleState: template.lifecycleState,
        rendered,
        validationErrors: [],
        missingVars: [],
        requiredVars,
      };
    } catch (err) {
      if (err instanceof TemplateVariableValidationError) {
        const missingVars = err.violations
          .filter((v) => v.code === 'missing')
          .map((v) => v.key);

        const validationErrors = err.violations.map((v) => {
          switch (v.code) {
            case 'missing':
              return `Missing required variable: "${v.key}"`;
            case 'unknown':
              return `Unknown variable: "${v.key}"`;
            case 'type_mismatch':
              return `Type mismatch for "${v.key}": expected ${v.expected}, got ${v.actual}`;
            default:
              return `Template variable validation failed: "${v.key}"`;
          }
        });

        return {
          templateKey,
          version: template.version,
          lifecycleState: template.lifecycleState,
          rendered: null,
          validationErrors,
          missingVars,
          requiredVars,
        };
      }

      throw err;
    }
  }

  // ── Public email methods ──────────────────────────────────────────────────

  async sendWelcomeEmail(email: string, username: string): Promise<void> {
    const templateKey = 'welcome';
    const resolved = this.resolveActiveTemplate(templateKey);

    if (resolved) {
      const { template, isCanary } = resolved;
      const rendered = renderTemplate(templateKey, template, { username });
      await this.sendEmail(
        email,
        rendered.subject,
        rendered.html,
        rendered.text,
        'email_welcome',
        {
          templateKey,
          templateVersion: template.version,
          isCanary,
        },
      );
    } else {
      this.logger.error('No valid email template for welcome', {
        templateKey,
        activeVersion: this.templateRegistry?.[templateKey]?.activeVersion,
      });
      throw new NotFoundException({
        message: 'No active email template for welcome',
        templateKey,
        templateVersion: this.templateRegistry?.[templateKey]?.activeVersion,
        code: 'template_active_version_missing',
      });
    }
  }

  async sendReactionNotification(
    toEmail: string,
    username: string,
    reactorName: string,
    confessionContent: string,
    emoji: string,
  ): Promise<void> {
    const templateKey = 'reaction_notification';
    const resolved = this.resolveActiveTemplate(templateKey);

    if (resolved) {
      const { template, isCanary } = resolved;
      const rendered = renderTemplate(templateKey, template, {
        username,
        reactorName,
        emoji,
        confessionContent,
      });
      await this.sendEmail(
        toEmail,
        rendered.subject,
        rendered.html,
        rendered.text,
        'email_reaction',
        { templateKey, templateVersion: template.version, isCanary },
      );
    } else {
      await this.sendEmail(
        toEmail,
        `Someone reacted with ${emoji} to your confession!`,
        this.generateReactionEmailTemplate(
          username,
          reactorName,
          confessionContent,
          emoji,
        ),
        this.generateReactionEmailText(
          username,
          reactorName,
          confessionContent,
          emoji,
        ),
        'email_reaction',
      );
    }
  }

  async sendPasswordResetEmail(
    email: string,
    token: string,
    username?: string,
  ): Promise<void> {
    const templateKey = 'password_reset';
    const resolved = this.resolveActiveTemplate(templateKey);
    const resetUrl = `${this.configService.get<string>('app.frontendUrl', 'http://localhost:3000')}/reset-password?token=${token}`;

    if (resolved) {
      const { template, isCanary } = resolved;
      const rendered = renderTemplate(templateKey, template, {
        username: username || 'User',
        resetUrl,
        token,
      });
      await this.sendEmail(
        email,
        rendered.subject,
        rendered.html,
        rendered.text,
        'email_password_reset',
        { templateKey, templateVersion: template.version, isCanary },
      );
    } else {
      await this.sendEmail(
        email,
        'Reset Your XConfess Password',
        this.generateResetEmailTemplate(username || 'User', resetUrl, token),
        this.generateResetEmailText(username || 'User', resetUrl),
        'email_password_reset',
      );
    }
  }

  async sendCommentNotification(
    data: { to: string; confessionId: string; commentPreview: string },
    templateMeta?: TemplateMeta,
  ): Promise<void> {
    const { to, confessionId, commentPreview } = data;
    const templateKey = 'comment_notification';
    const resolved = this.resolveActiveTemplate(templateKey);

    if (resolved) {
      const { template, isCanary } = resolved;
      const rendered = renderTemplate(templateKey, template, {
        confessionId,
        commentPreview,
        frontendUrl: this.configService.get<string>(
          'app.frontendUrl',
          'http://localhost:3000',
        ),
      });
      await this.sendEmail(
        to,
        rendered.subject,
        rendered.html,
        rendered.text,
        'email_comment_notification',
        templateMeta ?? {
          templateKey,
          templateVersion: template.version,
          isCanary,
        },
      );
    } else {
      const frontendUrl = this.configService.get<string>(
        'app.frontendUrl',
        'http://localhost:3000',
      );
      await this.sendEmail(
        to,
        'New Comment on Your Confession',
        `<h2>Someone commented on your confession!</h2>
         <p>Here's a preview of the comment:</p>
         <blockquote>${commentPreview}</blockquote>
         <a href="${frontendUrl}/confessions/${confessionId}">View Confession</a>`,
        '',
        'email_comment_notification',
        templateMeta,
      );
    }
  }

  // ── Legacy template generators ────────────────────────────────────────────

  private generateReactionEmailTemplate(
    username: string,
    reactorName: string,
    confessionContent: string,
    emoji: string,
  ): string {
    const truncated =
      confessionContent.length > 100
        ? `${confessionContent.substring(0, 100)}...`
        : confessionContent;

    return `<!DOCTYPE html>
<html>
  <head>
    <style>
      body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
      .emoji { font-size: 24px; margin: 0 5px; }
      .confession { background-color: #fff; border-left: 4px solid #4CAF50; padding: 10px 15px; margin: 15px 0; font-style: italic; }
      .button { display: inline-block; padding: 12px 24px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
    </style>
  </head>
  <body>
    <h1>New Reaction! <span class="emoji">${emoji}</span></h1>
    <p>Hello ${username},</p>
    <p><strong>${reactorName}</strong> reacted with ${emoji} to your confession:</p>
    <div class="confession">"${truncated}"</div>
    <a href="${this.configService.get<string>('app.frontendUrl', 'http://localhost:3000')}" class="button">View on XConfess</a>
    <p style="font-size:12px;color:#777;">© ${new Date().getFullYear()} XConfess. All rights reserved.</p>
  </body>
</html>`;
  }

  private generateReactionEmailText(
    username: string,
    reactorName: string,
    confessionContent: string,
    emoji: string,
  ): string {
    const truncated =
      confessionContent.length > 100
        ? `${confessionContent.substring(0, 100)}...`
        : confessionContent;
    return `New Reaction! ${emoji}\n\nHello ${username},\n\n${reactorName} reacted with ${emoji} to your confession:\n\n"${truncated}"\n\nView on XConfess: ${this.configService.get<string>('app.frontendUrl', 'http://localhost:3000')}\n\n© ${new Date().getFullYear()} XConfess.`;
  }

  private generateResetEmailTemplate(
    username: string,
    resetUrl: string,
    token: string,
  ): string {
    return `<!DOCTYPE html>
<html>
  <body>
    <h2>Hello ${username},</h2>
    <p>We received a request to reset your password.</p>
    <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#007bff;color:white;text-decoration:none;border-radius:5px;">Reset My Password</a>
    <p>Or copy: <a href="${resetUrl}">${resetUrl}</a></p>
    <p><strong>This link expires in 15 minutes.</strong></p>
    <p>Reset token: <code>${token}</code></p>
  </body>
</html>`;
  }

  private generateResetEmailText(username: string, resetUrl: string): string {
    return `Hello ${username},\n\nReset your password: ${resetUrl}\n\nThis link expires in 15 minutes.`;
  }
}
