/**
 * Regression tests for sanitize-html logic (XSS prevention)
 * Issue #1011: Ensure comments and messages are properly sanitized.
 */
import { sanitize } from './sanitize.utils';

describe('Sanitize Utils - Regression Tests (#1011)', () => {
  it('should remove script tags', () => {
    const input = 'Hello <script>alert("xss")</script>world';
    const output = sanitize(input);
    expect(output).toBe('Hello world');
  });

  it('should remove event handlers (e.g., onclick)', () => {
    const input = '<b onclick="alert(\'xss\')">Click me</b>';
    const output = sanitize(input);
    // xss library typically strips attributes it doesn't recognize as safe
    expect(output).not.toContain('onclick');
    expect(output).toContain('<b>Click me</b>');
  });

  it('should preserve harmless formatting tags (b, i, em, strong)', () => {
    const input = '<strong>Bold</strong> and <em>Italic</em> text';
    const output = sanitize(input);
    expect(output).toBe('<strong>Bold</strong> and <em>Italic</em> text');
  });

  it('should handle malformed tags safely', () => {
    const input = '<img src=x onerror=alert(1)>';
    const output = sanitize(input);
    expect(output).not.toContain('onerror');
  });

  it('should escape or remove iframe and other sensitive tags', () => {
    const input = '<iframe src="http://malicious.com"></iframe>';
    const output = sanitize(input);
    expect(output).toBe('');
  });
});
