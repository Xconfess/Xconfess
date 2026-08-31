// src/moderation/moderation-state-machine.ts
import { ModerationStatus } from './ai-moderation.service';

const ALLOWED_TRANSITIONS: Record<ModerationStatus, ModerationStatus[]> = {
  [ModerationStatus.PENDING]: [
    ModerationStatus.APPROVED,
    ModerationStatus.FLAGGED,
    ModerationStatus.REJECTED,
  ],
  [ModerationStatus.APPROVED]: [ModerationStatus.FLAGGED],
  [ModerationStatus.FLAGGED]: [
    ModerationStatus.ESCALATED,
    ModerationStatus.RESOLVED,
    ModerationStatus.HIDDEN,
    ModerationStatus.REJECTED,
  ],
  [ModerationStatus.ESCALATED]: [
    ModerationStatus.RESOLVED,
    ModerationStatus.HIDDEN,
    ModerationStatus.REJECTED,
  ],
  [ModerationStatus.RESOLVED]: [ModerationStatus.FLAGGED],
  [ModerationStatus.HIDDEN]: [ModerationStatus.RESOLVED],
  [ModerationStatus.REJECTED]: [ModerationStatus.PENDING],
};

export class InvalidModerationTransitionError extends Error {
  constructor(
    public readonly from: ModerationStatus,
    public readonly to: ModerationStatus,
  ) {
    super(`Invalid moderation transition: ${from} -> ${to}`);
    this.name = 'InvalidModerationTransitionError';
  }
}

export function assertValidTransition(
  from: ModerationStatus,
  to: ModerationStatus,
): void {
  if (from === to) {
    throw new InvalidModerationTransitionError(from, to);
  }
  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new InvalidModerationTransitionError(from, to);
  }
}

export function getAllowedNextStates(
  from: ModerationStatus,
): ModerationStatus[] {
  return ALLOWED_TRANSITIONS[from] ?? [];
}