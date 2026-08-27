import { NotFoundException } from '@nestjs/common';
import { assertCanUseAnonymousIdentity } from './anonymous-identity-ownership';
import { createAnonymousOwnershipFixture } from '../../../test/utils/anonymous-ownership.factory';

describe('assertCanUseAnonymousIdentity', () => {
  it('allows public use of unlinked anonymous identities', () => {
    const fixture = createAnonymousOwnershipFixture();

    expect(() =>
      assertCanUseAnonymousIdentity(fixture.publicAnon),
    ).not.toThrow();
  });

  it('allows linked anonymous identity use by the owning user', () => {
    const fixture = createAnonymousOwnershipFixture();

    expect(() =>
      assertCanUseAnonymousIdentity(fixture.ownerLinkedAnon, {
        userId: fixture.ownerUserId,
      }),
    ).not.toThrow();
  });

  it('returns 404 for linked anonymous identity use by another user', () => {
    const fixture = createAnonymousOwnershipFixture();

    expect(() =>
      assertCanUseAnonymousIdentity(fixture.otherLinkedAnon, {
        userId: fixture.ownerUserId,
      }),
    ).toThrow(NotFoundException);
  });

  it('returns 404 for unauthenticated use of linked anonymous identities', () => {
    const fixture = createAnonymousOwnershipFixture();

    expect(() =>
      assertCanUseAnonymousIdentity(fixture.ownerLinkedAnon),
    ).toThrow(NotFoundException);
  });
});
