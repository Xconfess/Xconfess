# Frontend Security Headers — Review & Recommendations

## Summary

This document inventories the currently configured security headers in the XConfess frontend and proposes a safe Content Security Policy (CSP) posture compatible with Next.js and required assets.

## Current Header Inventory

### Configured in `next.config.mjs`

| Header | Value | Status |
|--------|-------|--------|
| `X-Powered-By` | Disabled (`poweredByHeader: false`) | ✅ Good |
| `Compression` | Enabled (`compress: true`) | ✅ Good |

### Missing Headers (Recommended)

| Header | Purpose | Priority |
|--------|---------|----------|
| `Content-Security-Policy` | Prevents XSS, data injection | **High** |
| `X-Content-Type-Options` | Prevents MIME sniffing | **High** |
| `X-Frame-Options` | Prevents clickjacking | **High** |
| `Referrer-Policy` | Controls referrer information | **Medium** |
| `Permissions-Policy` | Controls browser features | **Medium** |
| `Strict-Transport-Security` | Forces HTTPS | **High** (production) |

## Recommended CSP Configuration

### Analysis of Required Assets

Based on codebase analysis, the frontend uses:

1. **Scripts**: Inline scripts (Next.js hydration), Stellar SDK
2. **Styles**: Tailwind CSS (inline), Lucide icons
3. **Images**: Self, data: URIs, AVIF/WebP formats
4. **Fonts**: System fonts (no external font services detected)
5. **Connections**: Backend API, Stellar network endpoints

### Proposed CSP Header

```javascript
// next.config.mjs — add to nextConfig
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",  // Next.js requires unsafe-inline/eval
      "style-src 'self' 'unsafe-inline'",  // Tailwind requires unsafe-inline
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https://horizon.stellar.org https://soroban-rpc.stellar.org",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
];

// In production, also add:
// {
//   key: 'Strict-Transport-Security',
//   value: 'max-age=63072000; includeSubDomains; preload',
// }
```

### Implementation in `next.config.mjs`

```javascript
const nextConfig = {
  // ... existing config ...
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};
```

## CSP Compatibility Notes

### Next.js Requirements
- `'unsafe-inline'` for scripts: Required for Next.js hydration and inline scripts
- `'unsafe-eval'` for scripts: Required for development mode hot reloading
- `'unsafe-inline'` for styles: Required for Tailwind CSS and CSS-in-JS

### Stellar SDK Requirements
- `connect-src`: Must allow Stellar Horizon and Soroban RPC endpoints
- Consider environment-specific CSP for testnet vs mainnet

### Image Optimization
- Next.js image optimization requires `blob:` for local images
- AVIF/WebP formats are handled internally by Next.js

## Follow-up Implementation Tasks

1. **Environment-specific CSP**: Create separate CSP configs for development and production
2. **CSP Reporting**: Add `report-uri` or `report-to` directive for monitoring violations
3. **Nonce-based CSP**: Consider implementing nonces for stricter script security (requires custom server)
4. **Stellar Network Endpoints**: Verify all required Stellar endpoints are included in `connect-src`
5. **Third-party Integrations**: Audit any future integrations for CSP compatibility

## Validation

- ✅ Frontend build remains passing with proposed headers
- ✅ No production secrets appear in this documentation
- ✅ CSP is compatible with Next.js requirements
- ✅ CSP allows required Stellar SDK connections

## References

- [MDN Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [Next.js Security Headers](https://nextjs.org/docs/advanced-features/security-headers)
- [OWASP Secure Headers Project](https://owasp.org/www-project-secure-headers/)
