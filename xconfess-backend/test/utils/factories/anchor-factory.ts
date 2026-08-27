import { faker } from '@faker-js/faker';
import { AnonymousConfession } from '../../../src/confession/entities/confession.entity';
import { Gender } from '../../../src/confession/dto/get-confessions.dto';

/**
 * Factory for creating confessions with pending anchor states
 * 
 * Use this helper when you need to test scenarios involving:
 * - Confessions waiting for blockchain anchoring
 * - Stellar transaction processing
 * - Anchor verification workflows
 * - Pending blockchain operations
 */
export class AnchorFactory {
  /**
   * Create a confession with pending anchor state
   * 
   * This represents a confession that has stellar transaction data
   * but is not yet fully anchored on the blockchain
   */
  static buildPendingAnchor(overrides: Partial<AnonymousConfession> = {}): AnonymousConfession {
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
    
    // Pending anchor state - has transaction data but not fully anchored
    confession.stellarTxHash = this.generateValidTxHash();
    confession.stellarHash = this.generateConfessionHash(confession.message);
    confession.isAnchored = false; // Still pending
    confession.anchoredAt = null; // Not anchored yet
    
    return { ...confession, ...overrides } as AnonymousConfession;
  }

  /**
   * Create a confession with failed anchor state
   * 
   * This represents a confession where anchoring failed
   */
  static buildFailedAnchor(overrides: Partial<AnonymousConfession> = {}): AnonymousConfession {
    const confession = this.buildPendingAnchor(overrides);
    confession.stellarTxHash = this.generateValidTxHash();
    confession.stellarHash = this.generateConfessionHash(confession.message);
    confession.isAnchored = false;
    confession.anchoredAt = null;
    
    return confession;
  }

  /**
   * Create a fully anchored confession
   * 
   * This represents a successfully anchored confession
   */
  static buildAnchored(overrides: Partial<AnonymousConfession> = {}): AnonymousConfession {
    const confession = this.buildPendingAnchor(overrides);
    confession.isAnchored = true;
    confession.anchoredAt = faker.date.past({ years: 0.5 }); // Anchored within last 6 months
    
    return confession;
  }

  /**
   * Create a confession ready for anchoring (no stellar data yet)
   * 
   * This represents a confession that hasn't started the anchoring process
   */
  static buildReadyForAnchoring(overrides: Partial<AnonymousConfession> = {}): AnonymousConfession {
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
    
    // No stellar data yet - ready for anchoring
    confession.stellarTxHash = null;
    confession.stellarHash = null;
    confession.isAnchored = false;
    confession.anchoredAt = null;
    
    return { ...confession, ...overrides } as AnonymousConfession;
  }

  /**
   * Create multiple confessions with mixed anchor states
   * 
   * Useful for testing comprehensive anchor workflows
   */
  static buildMixedAnchorStates(count: number = 5): AnonymousConfession[] {
    const states = [
      () => this.buildReadyForAnchoring(),
      () => this.buildPendingAnchor(),
      () => this.buildAnchored(),
      () => this.buildFailedAnchor(),
    ];

    return Array.from({ length: count }, (_, index) => {
      const stateBuilder = states[index % states.length];
      return stateBuilder();
    });
  }

  /**
   * Generate a valid Stellar transaction hash (64-character hex string)
   */
  private static generateValidTxHash(): string {
    return faker.string.hexadecimal({ length: 64, prefix: '', case: 'lower' });
  }

  /**
   * Generate a confession hash (simulates stellarHash)
   */
  private static generateConfessionHash(message: string): string {
    // Simple hash simulation for testing
    const timestamp = Date.now().toString();
    const combined = message + timestamp;
    return faker.string.hexadecimal({ length: 64, prefix: '', case: 'lower' });
  }

  /**
   * Create deterministic test data for consistent testing
   * 
   * Use this when you need reproducible test scenarios
   */
  static buildDeterministic(): AnonymousConfession {
    const confession = new AnonymousConfession();
    confession.id = '550e8400-e29b-41d4-a716-446655440000';
    confession.message = 'Test confession for deterministic anchor testing';
    confession.gender = Gender.OTHER;
    confession.created_at = new Date('2024-01-15T10:30:00Z');
    confession.view_count = 42;
    confession.isDeleted = false;
    confession.deletedAt = null;
    confession.deletedBy = null;
    confession.moderationScore = 0.1234;
    confession.moderationFlags = [];
    confession.moderationStatus = 'approved';
    confession.requiresReview = false;
    confession.isHidden = false;
    confession.moderationDetails = {};
    
    // Deterministic pending anchor state
    confession.stellarTxHash = 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef1234567890';
    confession.stellarHash = 'f6e5d4c3b2a1098765432109876543210fedcba09876543210fedcba0987654321';
    confession.isAnchored = false;
    confession.anchoredAt = null;
    
    return confession;
  }
}
