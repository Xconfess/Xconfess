/**
 * Shared security test fixtures containing malicious payloads (XSS, event handlers, unsafe schemes)
 * to verify consistent sanitization behavior across frontend and backend services.
 */

export interface MaliciousPayloadFixture {
  id: string;
  description: string;
  input: string;
  expectedSanitizedConfessionContains?: string;
  expectedSanitizedConfessionNotContains: string[];
  expectedSanitizedPlainTextNotContains: string[];
}

export const MALICIOUS_PAYLOAD_FIXTURES: MaliciousPayloadFixture[] = [
  {
    id: 'script-tag-injection',
    description: 'Inline script tag execution payload',
    input: 'Hello <script>alert("xss")</script> world',
    expectedSanitizedConfessionContains: 'Hello  world',
    expectedSanitizedConfessionNotContains: ['<script>', 'alert('],
    expectedSanitizedPlainTextNotContains: ['<script>', 'alert('],
  },
  {
    id: 'onerror-attribute-injection',
    description: 'Image tag with onerror DOM event listener',
    input: '<img src="x" onerror="alert(\'xss\')" alt="test image" />',
    expectedSanitizedConfessionNotContains: ['onerror', 'alert('],
    expectedSanitizedPlainTextNotContains: ['<img', 'onerror', 'alert('],
  },
  {
    id: 'onclick-attribute-injection',
    description: 'HTML element with inline onclick event listener',
    input: '<b onclick="evil()">Bold Clickable</b>',
    expectedSanitizedConfessionContains: 'Bold Clickable',
    expectedSanitizedConfessionNotContains: ['onclick', 'evil()'],
    expectedSanitizedPlainTextNotContains: ['<b>', 'onclick', 'evil()'],
  },
  {
    id: 'javascript-url-scheme',
    description: 'Anchor tag with javascript pseudo-protocol href',
    input: '<a href="javascript:alert(1)">Click Me</a>',
    expectedSanitizedConfessionContains: 'Click Me',
    expectedSanitizedConfessionNotContains: ['javascript:', 'alert(1)'],
    expectedSanitizedPlainTextNotContains: ['<a', 'javascript:', 'alert(1)'],
  },
  {
    id: 'iframe-embedding',
    description: 'Iframe element embedding external site',
    input: 'Check this out <iframe src="https://evil.com"></iframe>',
    expectedSanitizedConfessionContains: 'Check this out',
    expectedSanitizedConfessionNotContains: ['<iframe', 'evil.com'],
    expectedSanitizedPlainTextNotContains: ['<iframe', 'evil.com'],
  },
  {
    id: 'object-embed-tag',
    description: 'Object / embed tag with executable payload',
    input: '<object data="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="></object>',
    expectedSanitizedConfessionNotContains: ['<object', 'base64'],
    expectedSanitizedPlainTextNotContains: ['<object', 'base64'],
  },
  {
    id: 'nested-script-tag',
    description: 'Nested malformed script tags attempting filter bypass',
    input: '<<script>script>alert(1)</script>',
    expectedSanitizedConfessionNotContains: ['<script>', 'alert(1)'],
    expectedSanitizedPlainTextNotContains: ['<script>', 'alert(1)'],
  },
];
