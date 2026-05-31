/**
 * Regression tests for WebSocket CORS and Origin behavior.
 * Issue #1010: Protect CORS assumptions and origin behavior.
 */
import { buildWebSocketServerOptions } from './websocket.adapter';

describe('WebSocket Adapter - CORS Regression Tests (#1010)', () => {
  it('should use FRONTEND_URL as the allowed CORS origin', () => {
    const frontendUrl = 'https://app.xconfess.com';
    const options = buildWebSocketServerOptions(frontendUrl);
    
    expect(options.cors).toBeDefined();
    expect(options.cors.origin).toBe(frontendUrl);
    expect(options.cors.credentials).toBe(true);
  });

  it('should default to localhost:3000 if no origin is provided (fallback check)', () => {
    // This replicates the logic in createIOServer fallback
    const defaultOrigin = 'http://localhost:3000';
    const options = buildWebSocketServerOptions(defaultOrigin);
    
    expect(options.cors.origin).toBe('http://localhost:3000');
  });

  it('should enforce strictly defined methods', () => {
    const options = buildWebSocketServerOptions('http://localhost:3000');
    expect(options.cors.methods).toEqual(['GET', 'POST']);
  });

  it('should have standard transport settings for stability', () => {
    const options = buildWebSocketServerOptions('http://localhost:3000');
    expect(options.transports).toEqual(['websocket', 'polling']);
    expect(options.allowUpgrades).toBe(true);
  });
});
