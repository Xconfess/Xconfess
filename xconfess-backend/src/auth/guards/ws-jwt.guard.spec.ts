import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import { WsJwtGuard } from './ws-jwt.guard';
import { WebSocketLogger } from '../../websocket/websocket.logger';

describe('WsJwtGuard', () => {
  let guard: WsJwtGuard;
  let jwtService: { verifyAsync: jest.Mock };
  let websocketLogger: { logAuthFailure: jest.Mock };
  let mockSocket: any;

  const buildContext = (socket: any): ExecutionContext => ({
    switchToWs: () => ({
      getClient: () => socket,
    }),
  } as any);

  beforeEach(() => {
    jwtService = { verifyAsync: jest.fn() };
    websocketLogger = { logAuthFailure: jest.fn() };
    mockSocket = {
      id: 'socket-1',
      handshake: {
        auth: {},
        headers: {},
      },
      data: {},
    };

    guard = new WsJwtGuard(
      jwtService as any,
      undefined,
      websocketLogger as any,
    );
  });

  it('should reject with NO_TOKEN_PROVIDED and log auth failure when no token', async () => {
    mockSocket.handshake = { auth: {}, headers: {} };

    await expect(
      guard.canActivate(buildContext(mockSocket)),
    ).rejects.toThrow(UnauthorizedException);

    expect(websocketLogger.logAuthFailure).toHaveBeenCalledWith({
      socketId: 'socket-1',
      reasonCode: 'NO_TOKEN_PROVIDED',
      correlationId: expect.any(String),
    });
  });

  it('should extract token from handshake.auth.token', async () => {
    mockSocket.handshake.auth = { token: 'valid-jwt' };
    jwtService.verifyAsync.mockResolvedValue({ sub: '1', username: 'test' });

    const result = await guard.canActivate(buildContext(mockSocket));

    expect(result).toBe(true);
    expect(jwtService.verifyAsync).toHaveBeenCalledWith('valid-jwt');
  });

  it('should extract token from Authorization header', async () => {
    mockSocket.handshake = {
      auth: {},
      headers: { authorization: 'Bearer header-token' },
    };
    jwtService.verifyAsync.mockResolvedValue({ sub: '2', username: 'u2' });

    const result = await guard.canActivate(buildContext(mockSocket));

    expect(result).toBe(true);
    expect(jwtService.verifyAsync).toHaveBeenCalledWith('header-token');
  });

  it('should extract token from cookies', async () => {
    mockSocket.handshake = {
      auth: {},
      headers: { cookie: 'token=cookie-token; other=value' },
    };
    jwtService.verifyAsync.mockResolvedValue({ sub: '3', username: 'u3' });

    const result = await guard.canActivate(buildContext(mockSocket));

    expect(result).toBe(true);
    expect(jwtService.verifyAsync).toHaveBeenCalledWith('cookie-token');
  });

  it('should reject with EXPIRED_TOKEN and log auth failure', async () => {
    mockSocket.handshake.auth = { token: 'expired-token' };
    jwtService.verifyAsync.mockRejectedValue(new TokenExpiredError('jwt expired', new Date()));

    await expect(
      guard.canActivate(buildContext(mockSocket)),
    ).rejects.toThrow(UnauthorizedException);

    expect(websocketLogger.logAuthFailure).toHaveBeenCalledWith({
      socketId: 'socket-1',
      reasonCode: 'EXPIRED_TOKEN',
      correlationId: expect.any(String),
    });
  });

  it('should reject with MALFORMED_TOKEN and log auth failure', async () => {
    mockSocket.handshake.auth = { token: 'bad-token' };
    jwtService.verifyAsync.mockRejectedValue(new Error('invalid signature'));

    await expect(
      guard.canActivate(buildContext(mockSocket)),
    ).rejects.toThrow(UnauthorizedException);

    expect(websocketLogger.logAuthFailure).toHaveBeenCalledWith({
      socketId: 'socket-1',
      reasonCode: 'MALFORMED_TOKEN',
      correlationId: expect.any(String),
    });
  });

  it('should reject with MISSING_SUBJECT when payload has no sub', async () => {
    mockSocket.handshake.auth = { token: 'no-sub-token' };
    jwtService.verifyAsync.mockResolvedValue({ username: 'test' });

    await expect(
      guard.canActivate(buildContext(mockSocket)),
    ).rejects.toThrow(UnauthorizedException);

    expect(websocketLogger.logAuthFailure).toHaveBeenCalledWith({
      socketId: 'socket-1',
      reasonCode: 'MISSING_SUBJECT',
      correlationId: expect.any(String),
    });
  });

  it('should work without WebSocketLogger (optional dependency)', async () => {
    const guardNoLogger = new WsJwtGuard(jwtService as any, undefined, undefined);
    mockSocket.handshake = { auth: {}, headers: {} };

    await expect(
      guardNoLogger.canActivate(buildContext(mockSocket)),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should scrub sensitive headers after extracting token', async () => {
    mockSocket.handshake = {
      auth: { token: 'scrub-test' },
      headers: { authorization: 'Bearer scrub-test', cookie: 'token=abc' },
    };
    jwtService.verifyAsync.mockResolvedValue({ sub: '1', username: 'test' });

    await guard.canActivate(buildContext(mockSocket));

    expect(mockSocket.handshake.headers.authorization).toBe('<REDACTED>');
    expect(mockSocket.handshake.headers.cookie).toBe('<REDACTED>');
  });

  it('should attach userId and username to socket data on success', async () => {
    mockSocket.handshake.auth = { token: 'good-token' };
    jwtService.verifyAsync.mockResolvedValue({ sub: '42', username: 'alice' });

    await guard.canActivate(buildContext(mockSocket));

    expect(mockSocket.data.userId).toBe('42');
    expect(mockSocket.data.username).toBe('alice');
  });

  it('should generate unique correlation IDs for each request', async () => {
    mockSocket.handshake = { auth: {}, headers: {} };

    await guard.canActivate(buildContext(mockSocket)).catch(() => {});
    const firstCorrelationId = websocketLogger.logAuthFailure.mock.calls[0][0].correlationId;

    websocketLogger.logAuthFailure.mockClear();
    mockSocket.id = 'socket-2';
    await guard.canActivate(buildContext(mockSocket)).catch(() => {});
    const secondCorrelationId = websocketLogger.logAuthFailure.mock.calls[0][0].correlationId;

    expect(firstCorrelationId).not.toBe(secondCorrelationId);
  });
});
