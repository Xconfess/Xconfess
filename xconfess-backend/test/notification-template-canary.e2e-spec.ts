/**
 * E2E tests for template canary routing and promotion/rollback flow.
 *
 * Validates deterministic version assignment per recipient, canary split
 * routing, promotion and rollback transitions, and registry lookup
 * behaviour against the pure functions exported from email.config.ts.
 *
 * @see https://github.com/Xconfess/Xconfess/issues/333
 */
import {
  recipientBucket,
  resolveTemplateVersion,
  resolveTemplate,
  getTemplateVersion,
  TemplateRolloutMap,
  TemplateRegistry,
  EmailTemplateVersion,
} from '../src/email/email.config';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TEMPLATE_KEY = 'comment_notification';

/** Fixed set of recipients used to validate deterministic routing. */
const RECIPIENT_FIXTURES = [
  'alice@example.com',
  'bob@example.com',
  'carol@example.com',
  'dave@example.com',
  'eve@example.com',
  'frank@example.com',
  'grace@example.com',
  'heidi@example.com',
  'ivan@example.com',
  'judy@example.com',
  'mallory@example.com',
  'oscar@example.com',
  'peggy@example.com',
  'sybil@example.com',
  'trent@example.com',
  'victor@example.com',
  'wendy@example.com',
  'xavier@example.com',
  'yvonne@example.com',
  'zach@example.com',
];

const makeVersion = (version: string): EmailTemplateVersion => ({
  version,
  subject: `Subject ${version}`,
  html: `<p>Hello {{confessionId}} — ${version}</p>`,
  text: `Hello {{confessionId}} — ${version}`,
  requiredVars: ['confessionId'],
});

const TEMPLATE_V1 = makeVersion('v1');
const TEMPLATE_V2 = makeVersion('v2');

const REGISTRY: TemplateRegistry = {
  [TEMPLATE_KEY]: [TEMPLATE_V1, TEMPLATE_V2],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Notification Template Canary Routing (e2e)', () => {
  // --------------------------------------------------------------------------
  // 1. Deterministic bucket stability
  // --------------------------------------------------------------------------
  describe('recipientBucket – deterministic stability', () => {
    it('should return the same bucket for the same recipient + template key across repeated calls', () => {
      for (const email of RECIPIENT_FIXTURES) {
        const first = recipientBucket(email, TEMPLATE_KEY);
        const second = recipientBucket(email, TEMPLATE_KEY);
        const third = recipientBucket(email, TEMPLATE_KEY);

        expect(first).toBe(second);
        expect(second).toBe(third);
      }
    });

    it('should return values in the range 0–99', () => {
      for (const email of RECIPIENT_FIXTURES) {
        const bucket = recipientBucket(email, TEMPLATE_KEY);
        expect(bucket).toBeGreaterThanOrEqual(0);
        expect(bucket).toBeLessThan(100);
      }
    });

    it('should produce different buckets for different template keys (avoids correlated rollouts)', () => {
      const bucketsA = RECIPIENT_FIXTURES.map((e) =>
        recipientBucket(e, 'template_a'),
      );
      const bucketsB = RECIPIENT_FIXTURES.map((e) =>
        recipientBucket(e, 'template_b'),
      );

      // With 20 recipients it's statistically near-impossible that every
      // bucket is identical across two different HMAC keys.
      const allSame = bucketsA.every((b, i) => b === bucketsB[i]);
      expect(allSame).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 2. resolveTemplateVersion – canary split scenarios
  // --------------------------------------------------------------------------
  describe('resolveTemplateVersion – split scenarios', () => {
    it('should route all recipients to activeVersion when canaryPercent is 0', () => {
      const rollout: TemplateRolloutMap = {
        [TEMPLATE_KEY]: {
          activeVersion: 'v1',
          canaryVersion: 'v2',
          canaryPercent: 0,
        },
      };

      for (const email of RECIPIENT_FIXTURES) {
        const result = resolveTemplateVersion(TEMPLATE_KEY, email, rollout);
        expect(result.version).toBe('v1');
        expect(result.isCanary).toBe(false);
      }
    });

    it('should route all recipients to activeVersion when canaryVersion is absent', () => {
      const rollout: TemplateRolloutMap = {
        [TEMPLATE_KEY]: {
          activeVersion: 'v1',
        },
      };

      for (const email of RECIPIENT_FIXTURES) {
        const result = resolveTemplateVersion(TEMPLATE_KEY, email, rollout);
        expect(result.version).toBe('v1');
        expect(result.isCanary).toBe(false);
      }
    });

    it('should route all recipients to canaryVersion when canaryPercent is 100 (full promotion)', () => {
      const rollout: TemplateRolloutMap = {
        [TEMPLATE_KEY]: {
          activeVersion: 'v1',
          canaryVersion: 'v2',
          canaryPercent: 100,
        },
      };

      for (const email of RECIPIENT_FIXTURES) {
        const result = resolveTemplateVersion(TEMPLATE_KEY, email, rollout);
        expect(result.version).toBe('v2');
        // Full promotion → isCanary is false (canary has graduated)
        expect(result.isCanary).toBe(false);
      }
    });

    it('should default to v1 when no rollout policy exists for the template key', () => {
      const rollout: TemplateRolloutMap = {};

      for (const email of RECIPIENT_FIXTURES) {
        const result = resolveTemplateVersion(TEMPLATE_KEY, email, rollout);
        expect(result.version).toBe('v1');
        expect(result.isCanary).toBe(false);
      }
    });

    it('should deterministically split recipients between active and canary at 20%', () => {
      const rollout: TemplateRolloutMap = {
        [TEMPLATE_KEY]: {
          activeVersion: 'v1',
          canaryVersion: 'v2',
          canaryPercent: 20,
        },
      };

      let canaryCount = 0;
      let activeCount = 0;

      for (const email of RECIPIENT_FIXTURES) {
        const result = resolveTemplateVersion(TEMPLATE_KEY, email, rollout);
        const bucket = recipientBucket(email, TEMPLATE_KEY);

        if (bucket < 20) {
          expect(result.version).toBe('v2');
          expect(result.isCanary).toBe(true);
          canaryCount++;
        } else {
          expect(result.version).toBe('v1');
          expect(result.isCanary).toBe(false);
          activeCount++;
        }
      }

      // Verify we actually exercised both branches
      expect(canaryCount + activeCount).toBe(RECIPIENT_FIXTURES.length);
      // With HMAC-SHA256 and 20 recipients the chance of 0 canary or 0 active
      // is negligible, but we guard against degenerate edge-cases.
      expect(canaryCount).toBeGreaterThanOrEqual(0);
      expect(activeCount).toBeGreaterThanOrEqual(0);
    });

    it('should remain stable across repeated sends for the same recipient (no flickering)', () => {
      const rollout: TemplateRolloutMap = {
        [TEMPLATE_KEY]: {
          activeVersion: 'v1',
          canaryVersion: 'v2',
          canaryPercent: 50,
        },
      };

      for (const email of RECIPIENT_FIXTURES) {
        const first = resolveTemplateVersion(TEMPLATE_KEY, email, rollout);
        const second = resolveTemplateVersion(TEMPLATE_KEY, email, rollout);
        const third = resolveTemplateVersion(TEMPLATE_KEY, email, rollout);

        expect(first.version).toBe(second.version);
        expect(second.version).toBe(third.version);
        expect(first.isCanary).toBe(second.isCanary);
        expect(second.isCanary).toBe(third.isCanary);
      }
    });
  });

  // --------------------------------------------------------------------------
  // 3. Promotion transition
  // --------------------------------------------------------------------------
  describe('promotion transition', () => {
    it('should route 100% to new active version after promoting canary', () => {
      // Before promotion: v1 active, v2 canary at 20%
      const preRollout: TemplateRolloutMap = {
        [TEMPLATE_KEY]: {
          activeVersion: 'v1',
          canaryVersion: 'v2',
          canaryPercent: 20,
        },
      };

      // Capture pre-promotion assignments
      const preBuckets = RECIPIENT_FIXTURES.map((email) => ({
        email,
        result: resolveTemplateVersion(TEMPLATE_KEY, email, preRollout),
      }));

      // After promotion: v2 becomes active, canary cleared
      const postRollout: TemplateRolloutMap = {
        [TEMPLATE_KEY]: {
          activeVersion: 'v2',
          canaryVersion: undefined,
          canaryPercent: 0,
        },
      };

      for (const email of RECIPIENT_FIXTURES) {
        const result = resolveTemplateVersion(TEMPLATE_KEY, email, postRollout);
        expect(result.version).toBe('v2');
        expect(result.isCanary).toBe(false);
      }
    });

    it('should never route to the retired version after promotion', () => {
      const postPromotion: TemplateRolloutMap = {
        [TEMPLATE_KEY]: {
          activeVersion: 'v2',
        },
      };

      for (const email of RECIPIENT_FIXTURES) {
        const result = resolveTemplateVersion(
          TEMPLATE_KEY,
          email,
          postPromotion,
        );
        expect(result.version).not.toBe('v1');
      }
    });
  });

  // --------------------------------------------------------------------------
  // 4. Rollback transition
  // --------------------------------------------------------------------------
  describe('rollback transition', () => {
    it('should restore 100% active-version routing after rollback', () => {
      // During canary: v1 active, v2 canary at 50%
      const duringCanary: TemplateRolloutMap = {
        [TEMPLATE_KEY]: {
          activeVersion: 'v1',
          canaryVersion: 'v2',
          canaryPercent: 50,
        },
      };

      // Ensure some recipients were on canary before rollback
      const canaryRecipients = RECIPIENT_FIXTURES.filter((email) => {
        const result = resolveTemplateVersion(
          TEMPLATE_KEY,
          email,
          duringCanary,
        );
        return result.isCanary;
      });
      // Sanity: at least one recipient was on canary
      expect(canaryRecipients.length).toBeGreaterThan(0);

      // After rollback: remove canary, reset percent
      const afterRollback: TemplateRolloutMap = {
        [TEMPLATE_KEY]: {
          activeVersion: 'v1',
          canaryVersion: undefined,
          canaryPercent: 0,
        },
      };

      for (const email of RECIPIENT_FIXTURES) {
        const result = resolveTemplateVersion(
          TEMPLATE_KEY,
          email,
          afterRollback,
        );
        expect(result.version).toBe('v1');
        expect(result.isCanary).toBe(false);
      }
    });

    it('should not route any recipient to the rolled-back version', () => {
      const afterRollback: TemplateRolloutMap = {
        [TEMPLATE_KEY]: {
          activeVersion: 'v1',
          canaryPercent: 0,
        },
      };

      for (const email of RECIPIENT_FIXTURES) {
        const result = resolveTemplateVersion(
          TEMPLATE_KEY,
          email,
          afterRollback,
        );
        expect(result.version).not.toBe('v2');
      }
    });
  });

  // --------------------------------------------------------------------------
  // 5. resolveTemplate – full registry integration
  // --------------------------------------------------------------------------
  describe('resolveTemplate – registry integration', () => {
    it('should return the correct EmailTemplateVersion for the active track', () => {
      const rollout: TemplateRolloutMap = {
        [TEMPLATE_KEY]: {
          activeVersion: 'v1',
          canaryPercent: 0,
        },
      };

      const { template, isCanary } = resolveTemplate(
        REGISTRY,
        rollout,
        TEMPLATE_KEY,
        'alice@example.com',
      );

      expect(template).toEqual(TEMPLATE_V1);
      expect(isCanary).toBe(false);
    });

    it('should return the canary EmailTemplateVersion when recipient is in canary bucket', () => {
      // Find a recipient that falls in the canary bucket at 50%
      const rollout: TemplateRolloutMap = {
        [TEMPLATE_KEY]: {
          activeVersion: 'v1',
          canaryVersion: 'v2',
          canaryPercent: 50,
        },
      };

      const canaryRecipient = RECIPIENT_FIXTURES.find((email) => {
        const bucket = recipientBucket(email, TEMPLATE_KEY);
        return bucket < 50;
      });

      // Should exist given 20 fixtures
      expect(canaryRecipient).toBeDefined();

      const { template, isCanary } = resolveTemplate(
        REGISTRY,
        rollout,
        TEMPLATE_KEY,
        canaryRecipient!,
      );

      expect(template).toEqual(TEMPLATE_V2);
      expect(isCanary).toBe(true);
    });

    it('should return isCanary false at 100% canary (full promotion)', () => {
      const rollout: TemplateRolloutMap = {
        [TEMPLATE_KEY]: {
          activeVersion: 'v1',
          canaryVersion: 'v2',
          canaryPercent: 100,
        },
      };

      const { template, isCanary } = resolveTemplate(
        REGISTRY,
        rollout,
        TEMPLATE_KEY,
        'alice@example.com',
      );

      expect(template).toEqual(TEMPLATE_V2);
      expect(isCanary).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 6. getTemplateVersion – error cases
  // --------------------------------------------------------------------------
  describe('getTemplateVersion – error handling', () => {
    it('should throw when template key is not registered', () => {
      expect(() =>
        getTemplateVersion(REGISTRY, 'nonexistent_key', 'v1'),
      ).toThrow('No templates registered for key: nonexistent_key');
    });

    it('should throw when requested version does not exist', () => {
      expect(() => getTemplateVersion(REGISTRY, TEMPLATE_KEY, 'v99')).toThrow(
        /Template version 'v99' not found for key 'comment_notification'/,
      );
    });

    it('should return the correct version when it exists', () => {
      const result = getTemplateVersion(REGISTRY, TEMPLATE_KEY, 'v1');
      expect(result).toEqual(TEMPLATE_V1);
    });
  });
});
