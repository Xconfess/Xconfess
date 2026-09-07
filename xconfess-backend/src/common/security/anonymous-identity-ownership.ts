import { NotFoundException } from '@nestjs/common';
import { AnonymousUser } from '../../user/entities/anonymous-user.entity';

export interface AnonymousIdentityActor {
  userId?: number | string | null;
}

/**
 * Anonymous identity ownership is intentionally fail-closed for linked
 * identities. Returning 404 keeps callers from enumerating whether a linked
 * anonymous identity exists or which account owns it.
 */
export function assertCanUseAnonymousIdentity(
  anonymousUser: AnonymousUser | null,
  actor?: AnonymousIdentityActor,
): asserts anonymousUser is AnonymousUser {
  if (!anonymousUser) {
    throw new NotFoundException('Anonymous user not found');
  }

  const linkedUserIds =
    anonymousUser.userLinks?.map((link) => String(link.userId)) ?? [];

  if (linkedUserIds.length === 0) {
    return;
  }

  const actorUserId = actor?.userId;
  if (!actorUserId || !linkedUserIds.includes(String(actorUserId))) {
    throw new NotFoundException('Anonymous identity not found');
  }
}
