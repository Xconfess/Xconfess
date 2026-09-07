import { AnonymousUser } from '../../src/user/entities/anonymous-user.entity';
import { UserAnonymousUser } from '../../src/user/entities/user-anonymous-link.entity';

export interface AnonymousOwnershipFixture {
  ownerUserId: number;
  otherUserId: number;
  ownerLinkedAnonId: string;
  otherLinkedAnonId: string;
  publicAnonId: string;
  ownerLinkedAnon: AnonymousUser;
  otherLinkedAnon: AnonymousUser;
  publicAnon: AnonymousUser;
}

export function createAnonymousOwnershipFixture(
  overrides: Partial<AnonymousOwnershipFixture> = {},
): AnonymousOwnershipFixture {
  const ownerUserId = overrides.ownerUserId ?? 101;
  const otherUserId = overrides.otherUserId ?? 202;
  const ownerLinkedAnonId =
    overrides.ownerLinkedAnonId ?? '11111111-1111-4111-8111-111111111111';
  const otherLinkedAnonId =
    overrides.otherLinkedAnonId ?? '22222222-2222-4222-8222-222222222222';
  const publicAnonId =
    overrides.publicAnonId ?? '33333333-3333-4333-8333-333333333333';

  return {
    ownerUserId,
    otherUserId,
    ownerLinkedAnonId,
    otherLinkedAnonId,
    publicAnonId,
    ownerLinkedAnon:
      overrides.ownerLinkedAnon ??
      makeAnonymousUser(ownerLinkedAnonId, ownerUserId),
    otherLinkedAnon:
      overrides.otherLinkedAnon ??
      makeAnonymousUser(otherLinkedAnonId, otherUserId),
    publicAnon:
      overrides.publicAnon ?? makeAnonymousUser(publicAnonId, null),
  };
}

export function makeAnonymousUser(
  id: string,
  linkedUserId: number | null,
): AnonymousUser {
  return {
    id,
    userLinks:
      linkedUserId === null
        ? []
        : ([
            {
              userId: linkedUserId,
              anonymousUserId: id,
            },
          ] as UserAnonymousUser[]),
  } as AnonymousUser;
}
