import { WebSocketLogger } from './websocket.logger';

describe('WebSocketLogger Disconnect Rate Alerting (#2350)', () => {
  let wsLogger: WebSocketLogger;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    wsLogger = new WebSocketLogger();
    warnSpy = jest.spyOn((wsLogger as any).logger, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Aggregate Disconnect & Reconnect Metrics', () => {
    it('initializes disconnect metrics with clean zero state', () => {
      const metrics = wsLogger.getDisconnectMetrics();
      expect(metrics.totalDisconnects).toBe(0);
      expect(metrics.totalReconnects).toBe(0);
      expect(metrics.recentDisconnectCount).toBe(0);
      expect(metrics.recentReconnectCount).toBe(0);
      expect(metrics.disconnectRatePerMinute).toBe(0);
      expect(metrics.sustainedRateExceeded).toBe(false);
    });

    it('tracks aggregate disconnects and reconnects accurately', () => {
      wsLogger.logConnection('sock-1', '127.0.0.1');
      wsLogger.recordDisconnection('transport close');
      wsLogger.recordReconnection();

      const metrics = wsLogger.getDisconnectMetrics();
      expect(metrics.totalDisconnects).toBe(1);
      expect(metrics.totalReconnects).toBe(1);
      expect(metrics.recentDisconnectCount).toBe(1);
      expect(metrics.recentReconnectCount).toBe(1);
    });

    it('resets disconnect metrics when resetMetrics is called', () => {
      wsLogger.recordDisconnection();
      wsLogger.recordReconnection();
      expect(wsLogger.getDisconnectMetrics().totalDisconnects).toBe(1);

      wsLogger.resetMetrics();
      const reset = wsLogger.getDisconnectMetrics();
      expect(reset.totalDisconnects).toBe(0);
      expect(reset.totalReconnects).toBe(0);
      expect(reset.recentDisconnectCount).toBe(0);
      expect(reset.recentReconnectCount).toBe(0);
    });
  });

  describe('Configurable Threshold Windows & Sustained Rate Alerting', () => {
    it('allows configuring windowSeconds and threshold dynamically', () => {
      wsLogger.configureAlerting({ windowSeconds: 30, threshold: 5 });
      const metrics = wsLogger.getDisconnectMetrics();
      expect(metrics.windowSeconds).toBe(30);
      expect(metrics.threshold).toBe(5);
    });

    it('triggers WS_SUSTAINED_DISCONNECT_RATE alert when threshold is reached within window', () => {
      wsLogger.configureAlerting({ windowSeconds: 60, threshold: 3 });

      const baseTime = Date.now();
      wsLogger.recordDisconnection('transport close', baseTime);
      wsLogger.recordDisconnection('ping timeout', baseTime + 1000);
      expect(warnSpy).not.toHaveBeenCalled();

      // Third disconnect reaches threshold of 3
      wsLogger.recordDisconnection('client disconnect', baseTime + 2000);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'WS_SUSTAINED_DISCONNECT_RATE',
          disconnectCount: 3,
          windowSeconds: 60,
          threshold: 3,
        }),
      );

      const metrics = wsLogger.getDisconnectMetrics();
      expect(metrics.sustainedRateExceeded).toBe(true);
      expect(metrics.disconnectRatePerMinute).toBe(3);
    });

    it('prunes disconnect timestamps outside the configured window', () => {
      wsLogger.configureAlerting({ windowSeconds: 10, threshold: 3 });

      const baseTime = 1000000;
      // 2 disconnects at baseTime
      wsLogger.recordDisconnection('err', baseTime);
      wsLogger.recordDisconnection('err', baseTime + 1000);

      // Next disconnect is 15 seconds later (past 10s window)
      wsLogger.recordDisconnection('err', baseTime + 15000);

      // The first 2 disconnects should have been pruned from the sliding window
      const metrics = wsLogger.getDisconnectMetrics(baseTime + 15000);
      expect(metrics.recentDisconnectCount).toBe(1);
      expect(metrics.totalDisconnects).toBe(3);
      expect(metrics.sustainedRateExceeded).toBe(false);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('honors ConfigService environment overrides for threshold and window', () => {
      const mockConfigService: any = {
        get: jest.fn((key: string) => {
          if (key === 'WS_DISCONNECT_RATE_THRESHOLD') return 25;
          if (key === 'WS_DISCONNECT_WINDOW_SECONDS') return 120;
          return undefined;
        }),
      };

      const configuredLogger = new WebSocketLogger(mockConfigService);
      const metrics = configuredLogger.getDisconnectMetrics();
      expect(metrics.threshold).toBe(25);
      expect(metrics.windowSeconds).toBe(120);
    });
  });

  describe('User Identifier Exclusion (Non-PII Requirement)', () => {
    it('alert payload strictly excludes user identifiers, IP addresses, and tokens', () => {
      wsLogger.configureAlerting({ threshold: 1, windowSeconds: 60 });
      wsLogger.recordDisconnection('transport error');

      expect(warnSpy).toHaveBeenCalledTimes(1);
      const alertPayload = warnSpy.mock.calls[0][0];

      // Verifying non-PII labels
      expect(alertPayload.event).toBe('WS_SUSTAINED_DISCONNECT_RATE');
      expect(alertPayload.userId).toBeUndefined();
      expect(alertPayload.user).toBeUndefined();
      expect(alertPayload.ip).toBeUndefined();
      expect(alertPayload.token).toBeUndefined();
      expect(alertPayload.authorization).toBeUndefined();
      expect(alertPayload.cookie).toBeUndefined();

      // Metric object is clean
      const metrics = wsLogger.getDisconnectMetrics();
      const keys = Object.keys(metrics);
      expect(keys).not.toContain('userId');
      expect(keys).not.toContain('ip');
      expect(keys).not.toContain('username');
    });
  });
});
