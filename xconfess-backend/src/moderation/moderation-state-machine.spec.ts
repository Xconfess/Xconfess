// src/moderation/moderation-state-machine.spec.ts — NEW
import { ModerationStatus } from './ai-moderation.service';
import {
  assertValidTransition,
  getAllowedNextStates,
  InvalidModerationTransitionError,
} from './moderation-state-machine';

describe('moderation state machine', () => {
  it.each([
    [ModerationStatus.PENDING, ModerationStatus.FLAGGED],
    [ModerationStatus.FLAGGED, ModerationStatus.ESCALATED],
    [ModerationStatus.FLAGGED, ModerationStatus.RESOLVED],
    [ModerationStatus.FLAGGED, ModerationStatus.HIDDEN],
    [ModerationStatus.ESCALATED, ModerationStatus.RESOLVED],
    [ModerationStatus.HIDDEN, ModerationStatus.RESOLVED],
    [ModerationStatus.REJECTED, ModerationStatus.PENDING],
  ])('allows %s -> %s', (from, to) => {
    expect(() => assertValidTransition(from, to)).not.toThrow();
  });

  it.each([
    [ModerationStatus.RESOLVED, ModerationStatus.ESCALATED],
    [ModerationStatus.HIDDEN, ModerationStatus.PENDING],
    [ModerationStatus.PENDING, ModerationStatus.HIDDEN],
    [ModerationStatus.REJECTED, ModerationStatus.RESOLVED],
  ])('rejects %s -> %s', (from, to) => {
    expect(() => assertValidTransition(from, to)).toThrow(
      InvalidModerationTransitionError,
    );
  });

  it('rejects a same-state no-op transition', () => {
    expect(() =>
      assertValidTransition(ModerationStatus.FLAGGED, ModerationStatus.FLAGGED),
    ).toThrow(InvalidModerationTransitionError);
  });

  it('returns the allowed next states for a given state', () => {
    expect(getAllowedNextStates(ModerationStatus.FLAGGED)).toEqual([
      ModerationStatus.ESCALATED,
      ModerationStatus.RESOLVED,
      ModerationStatus.HIDDEN,
      ModerationStatus.REJECTED,
    ]);
  });
});