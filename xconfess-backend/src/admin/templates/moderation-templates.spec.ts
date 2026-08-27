import { MODERATION_TEMPLATES, getTemplate } from './moderation-templates';

describe('moderation-templates', () => {
  describe('MODERATION_TEMPLATES', () => {
    it('should expose templates for all defined categories', () => {
      expect(MODERATION_TEMPLATES.report_resolved.length).toBeGreaterThan(0);
      expect(MODERATION_TEMPLATES.report_dismissed.length).toBeGreaterThan(0);
      expect(MODERATION_TEMPLATES.confession_deleted.length).toBeGreaterThan(0);
      expect(MODERATION_TEMPLATES.user_banned.length).toBeGreaterThan(0);
    });

    it('should have at least 2 templates per category', () => {
      for (const key of Object.keys(MODERATION_TEMPLATES)) {
        const templates =
          MODERATION_TEMPLATES[key as keyof typeof MODERATION_TEMPLATES];
        expect(templates.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('should have non-empty string content for every template', () => {
      for (const key of Object.keys(MODERATION_TEMPLATES)) {
        const templates =
          MODERATION_TEMPLATES[key as keyof typeof MODERATION_TEMPLATES];
        for (const tpl of templates) {
          expect(typeof tpl).toBe('string');
          expect(tpl.length).toBeGreaterThan(0);
        }
      }
    });

    it('should contain exactly 4 categories', () => {
      const keys = Object.keys(MODERATION_TEMPLATES);
      expect(keys).toHaveLength(4);
      expect(keys).toContain('report_resolved');
      expect(keys).toContain('report_dismissed');
      expect(keys).toContain('confession_deleted');
      expect(keys).toContain('user_banned');
    });
  });

  describe('getTemplate', () => {
    it('should return a template for valid action and index 0', () => {
      expect(getTemplate('report_resolved', 0)).toBeTruthy();
      expect(getTemplate('report_dismissed', 0)).toBeTruthy();
      expect(getTemplate('confession_deleted', 0)).toBeTruthy();
      expect(getTemplate('user_banned', 0)).toBeTruthy();
    });

    it('should return null for nonexistent action', () => {
      expect(getTemplate('nonexistent', 0)).toBeNull();
    });

    it('should return null for empty string action', () => {
      expect(getTemplate('', 0)).toBeNull();
    });

    it('should return null for undefined action', () => {
      expect(getTemplate(undefined as any, 0)).toBeNull();
    });

    it('should wrap around when index exceeds template count', () => {
      const first = getTemplate('report_resolved', 0);
      const wrapped = getTemplate('report_resolved', 3);
      expect(first).toBe(wrapped);
    });

    it('should return same template for index modulo length', () => {
      const templates = MODERATION_TEMPLATES.report_resolved;
      const idx = templates.length;
      expect(getTemplate('report_resolved', idx)).toBe(
        getTemplate('report_resolved', 0),
      );
    });

    it('should default index to 0 when not provided', () => {
      const result = getTemplate('report_resolved');
      expect(result).toBe(getTemplate('report_resolved', 0));
    });

    it('should return null for negative index', () => {
      expect(getTemplate('report_resolved', -1)).toBeNull();
    });
  });
});
