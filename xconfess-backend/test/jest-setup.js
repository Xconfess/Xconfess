/**
 * test/jest-setup.js
 *
 * Sets required environment variables BEFORE any test modules are loaded.
 * This ensures module-level constants that read process.env (e.g. ENCRYPTION_KEY
 * in crypto.util.ts) receive valid values and don't fall back to wrong-length defaults.
 *
 * Keys are exactly 32 characters — required for AES-256-GCM.
 */

// AES-256 key for CryptoUtil (email token encryption) — must be exactly 32 chars
process.env.EMAIL_ENCRYPTION_KEY = '00000000000000000000000000000000';

// AES-256 key for confession content encryption — must be exactly 32 chars
process.env.CONFESSION_AES_KEY   = '00000000000000000000000000000000';

// JWT secret used by JwtStrategy — must be present to avoid ConfigService errors
process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-chars';
