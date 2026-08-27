import { mapToSlimConfession, aggregateReactions } from '../confession-mapper';

describe('confession-mapper', () => {
  describe('aggregateReactions', () => {
    it('should aggregate emojis into types with count', () => {
      const reactions = [
        { emoji: '👍' },
        { emoji: '👍' },
        { emoji: '❤️' },
        { emoji: 'custom' },
      ];
      const result = aggregateReactions(reactions);
      expect(result).toEqual(
        expect.arrayContaining([
          { type: 'like', count: 2 },
          { type: 'love', count: 1 },
          { type: 'custom', count: 1 },
        ]),
      );
    });

    it('should return empty array for empty reactions', () => {
      expect(aggregateReactions([])).toEqual([]);
      expect(aggregateReactions(null as any)).toEqual([]);
    });
  });

  describe('mapToSlimConfession', () => {
    it('should map entities to slim confession DTOs', () => {
      const entity = {
        id: '123',
        message: 'decrypted content',
        gender: 'male',
        created_at: new Date('2026-06-26T10:00:00.000Z'),
        view_count: 5,
        isAnchored: true,
        stellarTxHash: '0x123',
        isDeleted: false,
        moderationScore: 0.1,
        reactions: [
          { emoji: '👍' },
          { emoji: '❤️' },
        ],
      };

      const result = mapToSlimConfession(entity);
      expect(result).toEqual({
        id: '123',
        message: 'decrypted content',
        gender: 'male',
        created_at: new Date('2026-06-26T10:00:00.000Z'),
        view_count: 5,
        isAnchored: true,
        stellarTxHash: '0x123',
        reactions: [
          { type: 'like', count: 1 },
          { type: 'love', count: 1 },
        ],
      });

      // Confirm deleted/internal properties are NOT mapped
      expect((result as any).isDeleted).toBeUndefined();
      expect((result as any).moderationScore).toBeUndefined();
    });
  });
});
