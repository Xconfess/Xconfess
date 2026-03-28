// src/moderation/ai-moderation.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export enum ModerationCategory {
  HATE_SPEECH = 'hate_speech',
  HARASSMENT = 'harassment',
  SELF_HARM = 'self_harm',
  VIOLENCE = 'violence',
  SEXUAL = 'sexual',
  SPAM = 'spam',
}

export enum ModerationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  FLAGGED = 'flagged',
}

export interface ModerationResult {
  score: number;
  flags: ModerationCategory[];
  status: ModerationStatus;
  details: Record<string, number>;
  requiresReview: boolean;
}

@Injectable()
export class AiModerationService {
  private readonly logger = new Logger(AiModerationService.name);
  private readonly openAiApiKey: string;
  private readonly perspectiveApiKey: string;
  private readonly highThreshold: number;
  private readonly mediumThreshold: number;
  private readonly enabledCategories: ModerationCategory[];
  private readonly autoActionEnabled: boolean;
  private requestCount = 0;
  private readonly maxRequestsPerMinute = 50;

  constructor(private readonly configService: ConfigService) {
    this.openAiApiKey = this.configService.get<string>('OPENAI_API_KEY', '');
    this.perspectiveApiKey = this.configService.get<string>(
      'PERSPECTIVE_API_KEY',
      '',
    );
    this.highThreshold = this.configService.get<number>(
      'MODERATION_HIGH_THRESHOLD',
      0.8,
    );
    this.mediumThreshold = this.configService.get<number>(
      'MODERATION_MEDIUM_THRESHOLD',
      0.5,
    );
    this.autoActionEnabled = this.configService.get<boolean>(
      'AUTO_ACTION_ENABLED',
      true,
    );

    const categoriesStr = this.configService.get<string>(
      'ENABLED_MODERATION_CATEGORIES',
      'hate_speech,harassment,self_harm,violence,sexual,spam',
    );
    this.enabledCategories = categoriesStr.split(',') as ModerationCategory[];
  }

  async moderateContent(
    content: string,
    userId?: string,
  ): Promise<ModerationResult> {
    try {
      if (this.requestCount >= this.maxRequestsPerMinute) {
        this.logger.warn('Rate limit reached, using fallback moderation');
        return this.fallbackModeration(content);
      }

      this.requestCount++;
      setTimeout(() => this.requestCount--, 60000);

      let result = await this.moderateWithOpenAI(content);

      if (!result) {
        this.logger.warn('OpenAI moderation failed, using Perspective API');
        result = await this.moderateWithPerspective(content);
      }

      if (!result) {
        this.logger.warn('All APIs failed, using rule-based moderation');
        result = this.fallbackModeration(content);
      }

      result.status = this.determineStatus(result.score);
      result.requiresReview = result.score >= this.mediumThreshold;

      this.logModerationDecision(content, result, userId);

      return result;
    } catch (error) {
      this.logger.error('Moderation error:', error);
      return this.fallbackModeration(content);
    }
  }

  private async moderateWithOpenAI(
    content: string,
  ): Promise<ModerationResult | null> {
    if (!this.openAiApiKey) return null;

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/moderations',
        { input: content },
        {
          headers: {
            Authorization: `Bearer ${this.openAiApiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 5000,
        },
      );

      const result = response.data.results[0];
      const flags: ModerationCategory[] = [];
      const details: Record<string, number> = {};

      if (
        result.categories.hate &&
        this.enabledCategories.includes(ModerationCategory.HATE_SPEECH)
      ) {
        flags.push(ModerationCategory.HATE_SPEECH);
        details.hate_speech = result.category_scores.hate;
      }
      if (
        result.categories.harassment &&
        this.enabledCategories.includes(ModerationCategory.HARASSMENT)
      ) {
        flags.push(ModerationCategory.HARASSMENT);
        details.harassment = result.category_scores.harassment;
      }
      if (
        result.categories['self-harm'] &&
        this.enabledCategories.includes(ModerationCategory.SELF_HARM)
      ) {
        flags.push(ModerationCategory.SELF_HARM);
        details.self_harm = result.category_scores['self-harm'];
      }
      if (
        result.categories.violence &&
        this.enabledCategories.includes(ModerationCategory.VIOLENCE)
      ) {
        flags.push(ModerationCategory.VIOLENCE);
        details.violence = result.category_scores.violence;
      }
      if (
        result.categories.sexual &&
        this.enabledCategories.includes(ModerationCategory.SEXUAL)
      ) {
        flags.push(ModerationCategory.SEXUAL);
        details.sexual = result.category_scores.sexual;
      }

      const scores = Object.values(result.category_scores).map((v) =>
        typeof v === 'number' ? v : Number(v),
      );
      const maxScore = scores.length > 0 ? Math.max(...scores) : 0;

      return {
        score: maxScore,
        flags,
        status: ModerationStatus.PENDING,
        details,
        requiresReview: false,
      };
    } catch (error) {
      this.logger.error('OpenAI moderation failed:', error.message);
      return null;
    }
  }

  private async moderateWithPerspective(
    content: string,
  ): Promise<ModerationResult | null> {
    if (!this.perspectiveApiKey) return null;

    try {
      const response = await axios.post(
        `https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${this.perspectiveApiKey}`,
        {
          comment: { text: content },
          requestedAttributes: {
            TOXICITY: {},
            SEVERE_TOXICITY: {},
            IDENTITY_ATTACK: {},
            INSULT: {},
            THREAT: {},
          },
        },
        { timeout: 5000 },
      );

      const attributes = response.data.attributeScores;
      const flags: ModerationCategory[] = [];
      const details: Record<string, number> = {};

      const toxicity = attributes.TOXICITY?.summaryScore?.value || 0;
      const severeToxicity =
        attributes.SEVERE_TOXICITY?.summaryScore?.value || 0;
      const identityAttack =
        attributes.IDENTITY_ATTACK?.summaryScore?.value || 0;
      const insult = attributes.INSULT?.summaryScore?.value || 0;
      const threat = attributes.THREAT?.summaryScore?.value || 0;

      if (
        identityAttack > 0.5 &&
        this.enabledCategories.includes(ModerationCategory.HATE_SPEECH)
      ) {
        flags.push(ModerationCategory.HATE_SPEECH);
        details.hate_speech = identityAttack;
      }
      if (
        (insult > 0.5 || toxicity > 0.7) &&
        this.enabledCategories.includes(ModerationCategory.HARASSMENT)
      ) {
        flags.push(ModerationCategory.HARASSMENT);
        details.harassment = Math.max(insult, toxicity);
      }
      if (
        threat > 0.5 &&
        this.enabledCategories.includes(ModerationCategory.VIOLENCE)
      ) {
        flags.push(ModerationCategory.VIOLENCE);
        details.violence = threat;
      }

      const maxScore = Math.max(
        toxicity,
        severeToxicity,
        identityAttack,
        insult,
        threat,
      );

      return {
        score: maxScore,
        flags,
        status: ModerationStatus.PENDING,
        details,
        requiresReview: false,
      };
    } catch (error) {
      this.logger.error('Perspective API moderation failed:', error.message);
      return null;
    }
  }

  private fallbackModeration(content: string): ModerationResult {
    const flags: ModerationCategory[] = [];
    const details: Record<string, number> = {};
    let score = 0;

    const lowerContent = content.toLowerCase();

    const hatePatterns = ['hate', 'racist', 'bigot', 'nazi', 'slur'];
    const hateScore = this.countPatterns(lowerContent, hatePatterns) * 0.3;
    if (
      hateScore > 0 &&
      this.enabledCategories.includes(ModerationCategory.HATE_SPEECH)
    ) {
      flags.push(ModerationCategory.HATE_SPEECH);
      details.hate_speech = Math.min(hateScore, 1);
      score = Math.max(score, hateScore);
    }

    const selfHarmPatterns = [
      'kill myself',
      'suicide',
      'end my life',
      'self harm',
    ];
    const selfHarmScore =
      this.countPatterns(lowerContent, selfHarmPatterns) * 0.4;
    if (
      selfHarmScore > 0 &&
      this.enabledCategories.includes(ModerationCategory.SELF_HARM)
    ) {
      flags.push(ModerationCategory.SELF_HARM);
      details.self_harm = Math.min(selfHarmScore, 1);
      score = Math.max(score, selfHarmScore);
    }

    const violencePatterns = ['kill', 'murder', 'assault', 'attack', 'bomb'];
    const violenceScore =
      this.countPatterns(lowerContent, violencePatterns) * 0.25;
    if (
      violenceScore > 0 &&
      this.enabledCategories.includes(ModerationCategory.VIOLENCE)
    ) {
      flags.push(ModerationCategory.VIOLENCE);
      details.violence = Math.min(violenceScore, 1);
      score = Math.max(score, violenceScore);
    }

    const spamIndicators = [
      content.includes('http://') || content.includes('https://'),
      content.length > 1000,
      /(.)\1{4,}/.test(content),
      content.split(' ').some((word) => word.length > 30),
    ];
    const spamScore = spamIndicators.filter(Boolean).length * 0.2;
    if (
      spamScore > 0 &&
      this.enabledCategories.includes(ModerationCategory.SPAM)
    ) {
      flags.push(ModerationCategory.SPAM);
      details.spam = Math.min(spamScore, 1);
      score = Math.max(score, spamScore);
    }

    return {
      score: Math.min(score, 1),
      flags,
      status: ModerationStatus.PENDING,
      details,
      requiresReview: false,
    };
  }

  private countPatterns(content: string, patterns: string[]): number {
    let count = 0;
    for (const pattern of patterns) {
      if (content.includes(pattern)) count++;
    }
    return count;
  }

  private determineStatus(score: number): ModerationStatus {
    if (!this.autoActionEnabled) return ModerationStatus.PENDING;
    if (score >= this.highThreshold) return ModerationStatus.REJECTED;
    if (score >= this.mediumThreshold) return ModerationStatus.FLAGGED;
    return ModerationStatus.APPROVED;
  }

  private logModerationDecision(
    content: string,
    result: ModerationResult,
    userId?: string,
  ): void {
    this.logger.log({
      event: 'moderation_decision',
      userId,
      contentLength: content.length,
      score: result.score,
      status: result.status,
      flags: result.flags,
      requiresReview: result.requiresReview,
      timestamp: new Date().toISOString(),
    });
  }

  updateThresholds(high: number, medium: number): void {
    if (high > 0 && high <= 1 && medium > 0 && medium <= 1 && medium < high) {
      this.logger.log(`Thresholds updated: high=${high}, medium=${medium}`);
    }
  }

  getConfiguration() {
    return {
      highThreshold: this.highThreshold,
      mediumThreshold: this.mediumThreshold,
      enabledCategories: this.enabledCategories,
      autoActionEnabled: this.autoActionEnabled,
    };
  }
}
