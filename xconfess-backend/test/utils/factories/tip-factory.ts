import { faker } from '@faker-js/faker';
import { Tip, TipVerificationStatus } from '../../../src/tipping/entities/tip.entity';
import { AnonymousConfession } from '../../../src/confession/entities/confession.entity';
import { Gender } from '../../../src/confession/dto/get-confessions.dto';

/**
 * Factory for creating tips with various states including pending verification
 * 
 * Use this helper when you need to test scenarios involving:
 * - Tips waiting for blockchain verification
 * - Stellar transaction processing for tips
 * - Tip verification workflows
 * - Anonymous tipping operations
 * - Tip statistics and aggregation
 */
export class TipFactory {
  /**
   * Create a tip with pending verification state
   * 
   * This represents a tip that has been submitted but is waiting
   * for blockchain verification
   */
  static buildPendingTip(confessionId?: string, overrides: Partial<Tip> = {}): Tip {
    const tip = new Tip();
    tip.id = faker.string.uuid();
    tip.confessionId = confessionId || faker.string.uuid();
    tip.amount = faker.number.float({ min: 0.1, max: 10.0, precision: 0.000001 });
    tip.txId = this.generateValidTxHash();
    tip.senderAddress = this.generateStellarAddress(); // Can be null for anonymous
    tip.createdAt = faker.date.recent({ days: 1 }); // Recent tip
    tip.verificationStatus = TipVerificationStatus.PENDING;
    
    return { ...tip, ...overrides } as Tip;
  }

  /**
   * Create a verified tip (fully processed)
   * 
   * This represents a tip that has been successfully verified
   * and recorded on the blockchain
   */
  static buildVerifiedTip(confessionId?: string, overrides: Partial<Tip> = {}): Tip {
    const tip = this.buildPendingTip(confessionId, overrides);
    tip.createdAt = faker.date.past({ days: 30 }); // Verified in the past
    tip.verificationStatus = TipVerificationStatus.VERIFIED;
    tip.verifiedAt = faker.date.recent({ days: 1 });
    return tip;
  }

  /**
   * Create an anonymous tip (no sender address)
   * 
   * This represents a tip where the sender chose to remain anonymous
   */
  static buildAnonymousTip(confessionId?: string, overrides: Partial<Tip> = {}): Tip {
    const tip = this.buildPendingTip(confessionId, overrides);
    tip.senderAddress = null; // Anonymous tip
    return tip;
  }

  /**
   * Create a tip with invalid transaction (for error testing)
   * 
   * This represents a tip with an invalid or non-existent transaction
   */
  static buildInvalidTip(confessionId?: string, overrides: Partial<Tip> = {}): Tip {
    const tip = new Tip();
    tip.id = faker.string.uuid();
    tip.confessionId = confessionId || faker.string.uuid();
    tip.amount = faker.number.float({ min: 0.1, max: 10.0, precision: 0.000001 });
    tip.txId = this.generateInvalidTxHash(); // Invalid hash
    tip.senderAddress = this.generateStellarAddress();
    tip.createdAt = faker.date.recent({ days: 1 });
    tip.verificationStatus = TipVerificationStatus.REJECTED;
    tip.rejectionReason = 'invalid_transaction';
    
    return { ...tip, ...overrides } as Tip;
  }

  /**
   * Create a tip with minimum amount (edge case testing)
   */
  static buildMinimumTip(confessionId?: string, overrides: Partial<Tip> = {}): Tip {
    const tip = this.buildPendingTip(confessionId, overrides);
    tip.amount = 0.1; // Minimum allowed amount
    return tip;
  }

  /**
   * Create a tip with large amount (edge case testing)
   */
  static buildLargeTip(confessionId?: string, overrides: Partial<Tip> = {}): Tip {
    const tip = this.buildPendingTip(confessionId, overrides);
    tip.amount = faker.number.float({ min: 50.0, max: 1000.0, precision: 0.000001 });
    return tip;
  }

  /**
   * Create multiple tips with mixed states for a confession
   * 
   * Useful for testing tip aggregation and statistics
   */
  static buildMixedTipsForConfession(confessionId: string, count: number = 5): Tip[] {
    const tipBuilders = [
      () => this.buildVerifiedTip(confessionId),
      () => this.buildAnonymousTip(confessionId),
      () => this.buildPendingTip(confessionId),
      () => this.buildMinimumTip(confessionId),
      () => this.buildLargeTip(confessionId),
    ];

    return Array.from({ length: count }, () => {
      const builder = faker.helpers.arrayElement(tipBuilders);
      return builder();
    });
  }

  /**
   * Create a confession with associated tips (complete test scenario)
   * 
   * This creates both a confession and its associated tips for comprehensive testing
   */
  static buildConfessionWithTips(tipCount: number = 3): {
    confession: AnonymousConfession;
    tips: Tip[];
  } {
    const confession = new AnonymousConfession();
    confession.id = faker.string.uuid();
    confession.message = faker.lorem.paragraph();
    confession.gender = faker.helpers.arrayElement([Gender.MALE, Gender.FEMALE, Gender.OTHER, null]);
    confession.created_at = faker.date.past();
    confession.view_count = faker.number.int({ min: 0, max: 1000 });
    confession.isDeleted = false;
    confession.deletedAt = null;
    confession.deletedBy = null;
    confession.moderationScore = faker.number.float({ min: 0, max: 1, precision: 0.0001 });
    confession.moderationFlags = [];
    confession.moderationStatus = 'approved';
    confession.requiresReview = false;
    confession.isHidden = false;
    confession.moderationDetails = {};
    confession.stellarTxHash = null;
    confession.stellarHash = null;
    confession.isAnchored = false;
    confession.anchoredAt = null;

    const tips = this.buildMixedTipsForConfession(confession.id, tipCount);

    return { confession, tips };
  }

  /**
   * Generate a valid Stellar transaction hash (64-character hex string)
   */
  private static generateValidTxHash(): string {
    return faker.string.hexadecimal({ length: 64, prefix: '', case: 'lower' });
  }

  /**
   * Generate an invalid transaction hash for error testing
   */
  private static generateInvalidTxHash(): string {
    return faker.string.alphanumeric({ length: 10 }); // Too short, invalid format
  }

  /**
   * Generate a valid Stellar address (56 characters, starts with 'G')
   */
  private static generateStellarAddress(): string {
    return 'G' + faker.string.alphanumeric({ length: 55 });
  }

  /**
   * Create deterministic test data for consistent testing
   * 
   * Use this when you need reproducible test scenarios
   */
  static buildDeterministic(confessionId: string = '550e8400-e29b-41d4-a716-446655440000'): Tip {
    const tip = new Tip();
    tip.id = '660e8400-e29b-41d4-a716-446655440001';
    tip.confessionId = confessionId;
    tip.amount = 1.5; // Deterministic amount
    tip.txId = 'b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef1234567890';
    tip.senderAddress = 'GD5A5F5B5D5F5B5D5F5B5D5F5B5D5F5B5D5F5B5D5F5B5D5F5B5D5F5B5D5F5B';
    tip.createdAt = new Date('2024-01-15T11:45:00Z');
    
    return tip;
  }

  /**
   * Create deterministic anonymous tip for consistent testing
   */
  static buildDeterministicAnonymous(confessionId: string = '550e8400-e29b-41d4-a716-446655440000'): Tip {
    const tip = this.buildDeterministic(confessionId);
    tip.id = '660e8400-e29b-41d4-a716-446655440002';
    tip.amount = 0.5;
    tip.senderAddress = null; // Anonymous
    tip.createdAt = new Date('2024-01-15T12:30:00Z');
    
    return tip;
  }

  /**
   * Create tips specifically for pending verification testing
   * 
   * These tips are designed to test the verification workflow
   */
  static buildPendingVerificationBatch(confessionId: string, count: number = 3): Tip[] {
    return Array.from({ length: count }, (_, index) => {
      const tip = this.buildPendingTip(confessionId);
      tip.id = `770e8400-e29b-41d4-a716-44665544${index.toString().padStart(4, '0')}`;
      tip.amount = parseFloat((0.5 + index * 0.25).toFixed(6));
      tip.createdAt = new Date(Date.now() - index * 60000); // 1 minute apart
      return tip;
    });
  }
}
