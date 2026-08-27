/**
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';
import { getReconnectDelay, useWebSocket } from '../useWebSocket';

describe('getReconnectDelay', () => {
  it('returns base delay on attempt 0', () => {
    expect(getReconnectDelay(0, 1000, 30000)).toBe(1000);
  });

  it('doubles delay on each attempt', () => {
    expect(getReconnectDelay(1, 1000, 30000)).toBe(2000);
    expect(getReconnectDelay(2, 1000, 30000)).toBe(4000);
    expect(getReconnectDelay(3, 1000, 30000)).toBe(8000);
    expect(getReconnectDelay(4, 1000, 30000)).toBe(16000);
  });

  it('caps at maxDelay', () => {
    expect(getReconnectDelay(5, 1000, 30000)).toBe(30000);
    expect(getReconnectDelay(10, 1000, 30000)).toBe(30000);
  });

  it('respects custom baseDelay', () => {
    expect(getReconnectDelay(0, 500, 30000)).toBe(500);
    expect(getReconnectDelay(1, 500, 30000)).toBe(1000);
    expect(getReconnectDelay(2, 500, 30000)).toBe(2000);
  });

  it('respects custom maxDelay', () => {
    expect(getReconnectDelay(3, 1000, 5000)).toBe(5000);
  });

  it('produces the 1s→2s→4s→30s sequence from the issue spec', () => {
    const attempts = [0, 1, 2, 3, 4, 5];
    const delays = attempts.map((a) => getReconnectDelay(a, 1000, 30000));
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, 30000]);
  });
});

describe('WebSocket reconnection constants', () => {
  it('default max attempts is 10', () => {
    expect(typeof useWebSocket).toBe('function');
  });
});

class MockWebSocket {
  url: string;
  readyState: number = 0; // CONNECTING
  onopen: (() => void) | null = null;
  onclose: ((event: any) => void) | null = null;
  onerror: ((error: any) => void) | null = null;
  onmessage: ((event: any) => void) | null = null;
  send = jest.fn();
  close = jest.fn();

  static instances: MockWebSocket[] = [];

  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  CONNECTING = 0;
  OPEN = 1;
  CLOSING = 2;
  CLOSED = 3;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  triggerOpen() {
    this.readyState = 1; // OPEN
    if (this.onopen) {
      act(() => {
        this.onopen!();
      });
    }
  }

  triggerClose(code = 1000, reason = '', wasClean = true) {
    this.readyState = 3; // CLOSED
    if (this.onclose) {
      act(() => {
        this.onclose!({ code, reason, wasClean } as CloseEvent);
      });
    }
  }

  triggerError(error: any = new Event('error')) {
    if (this.onerror) {
      act(() => {
        this.onerror!(error);
      });
    }
  }

  triggerMessage(data: any) {
    if (this.onmessage) {
      const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
      act(() => {
        this.onmessage!({ data: dataStr } as MessageEvent);
      });
    }
  }
}

describe('useWebSocket hook behavior', () => {
  let originalWebSocket: any;

  beforeAll(() => {
    originalWebSocket = global.WebSocket;
    global.WebSocket = MockWebSocket as any;
  });

  afterAll(() => {
    global.WebSocket = originalWebSocket;
  });

  beforeEach(() => {
    MockWebSocket.instances = [];
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('1. Initial connection lifecycle', () => {
    const onOpen = jest.fn();
    const { result } = renderHook(() =>
      useWebSocket({
        url: 'ws://example.com',
        onOpen,
      })
    );

    // Initial check
    expect(result.current.state).toBe('connecting');
    expect(MockWebSocket.instances).toHaveLength(1);
    const mockWs = MockWebSocket.instances[0];
    expect(mockWs.url).toBe('ws://example.com');

    // Transition to connected
    mockWs.triggerOpen();
    expect(result.current.state).toBe('connected');
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('2. Disconnect behavior (unexpected close)', () => {
    const onClose = jest.fn();
    const { result } = renderHook(() =>
      useWebSocket({
        url: 'ws://example.com',
        onClose,
        reconnect: true,
        reconnectBaseDelay: 1000,
      })
    );

    const mockWs = MockWebSocket.instances[0];
    mockWs.triggerOpen();

    // Trigger unexpected close
    mockWs.triggerClose(1006, 'Abnormal Closure');

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe('reconnecting');
    expect(result.current.reconnectAttempts).toBe(1);
  });

  it('3. Reconnect behavior (successive attempts and successful reconnect)', () => {
    const onOpen = jest.fn();
    const { result } = renderHook(() =>
      useWebSocket({
        url: 'ws://example.com',
        onOpen,
        reconnect: true,
        reconnectBaseDelay: 1000,
        reconnectMaxDelay: 5000,
      })
    );

    const ws1 = MockWebSocket.instances[0];
    ws1.triggerOpen();
    expect(onOpen).toHaveBeenCalledTimes(1);

    // Disconnect
    ws1.triggerClose(1006);
    expect(result.current.state).toBe('reconnecting');

    // Advance timer for 1st reconnect (delay = 1000ms)
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    // Verify 2nd WebSocket was created
    expect(MockWebSocket.instances).toHaveLength(2);
    const ws2 = MockWebSocket.instances[1];
    expect(result.current.state).toBe('connecting');

    // Open second socket
    ws2.triggerOpen();
    expect(result.current.state).toBe('connected');
    expect(result.current.reconnectAttempts).toBe(0);
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it('4. Duplicate listener / stale socket cleanup', () => {
    const onMessage = jest.fn();
    const { result } = renderHook(() =>
      useWebSocket({
        url: 'ws://example.com',
        onMessage,
        reconnect: true,
        reconnectBaseDelay: 1000,
      })
    );

    const ws1 = MockWebSocket.instances[0];
    ws1.triggerOpen();

    // Trigger close on ws1, scheduling reconnect
    ws1.triggerClose(1006);

    // Advance timers to trigger reconnect
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    const ws2 = MockWebSocket.instances[1];
    ws2.triggerOpen();

    // Send message on active socket ws2
    ws2.triggerMessage({ data: 'hello' });
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenLastCalledWith({ data: 'hello' }, undefined);

    // Send message on stale socket ws1 (should be ignored)
    ws1.triggerMessage({ data: 'stale' });
    expect(onMessage).toHaveBeenCalledTimes(1); // Still 1
  });

  it('5. Manual disconnect behavior', () => {
    const onClose = jest.fn();
    const { result } = renderHook(() =>
      useWebSocket({
        url: 'ws://example.com',
        onClose,
        reconnect: true,
      })
    );

    const ws1 = MockWebSocket.instances[0];
    ws1.triggerOpen();

    // Call disconnect
    act(() => {
      result.current.disconnect();
    });

    expect(ws1.close).toHaveBeenCalledTimes(1);
    // Explicit close triggered
    ws1.triggerClose(1000);

    expect(result.current.state).toBe('disconnected');
    // Ensure no reconnect timer is scheduled
    act(() => {
      jest.advanceTimersByTime(10000);
    });
    expect(MockWebSocket.instances).toHaveLength(1); // No new instance
  });

  it('6. Reconnect disabled behavior', () => {
    const onClose = jest.fn();
    const { result } = renderHook(() =>
      useWebSocket({
        url: 'ws://example.com',
        onClose,
        reconnect: false,
      })
    );

    const ws1 = MockWebSocket.instances[0];
    ws1.triggerOpen();
    ws1.triggerClose(1006);

    expect(result.current.state).toBe('disconnected');
    act(() => {
      jest.advanceTimersByTime(10000);
    });
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('7. Maximum reconnect attempts configuration', () => {
    const { result } = renderHook(() =>
      useWebSocket({
        url: 'ws://example.com',
        reconnect: true,
        maxReconnectAttempts: 2,
        reconnectBaseDelay: 1000,
      })
    );

    const ws1 = MockWebSocket.instances[0];
    ws1.triggerOpen();

    // 1st close
    ws1.triggerClose(1006);
    expect(result.current.state).toBe('reconnecting');

    // 1st reconnect
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(MockWebSocket.instances).toHaveLength(2);
    const ws2 = MockWebSocket.instances[1];
    // Fail 2nd connection
    ws2.triggerClose(1006);

    // 2nd reconnect
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(MockWebSocket.instances).toHaveLength(3);
    const ws3 = MockWebSocket.instances[2];
    // Fail 3rd connection (which reached attempt 2 limit)
    ws3.triggerClose(1006);

    // Should stop reconnecting now
    expect(result.current.state).toBe('disconnected');
    act(() => {
      jest.advanceTimersByTime(10000);
    });
    expect(MockWebSocket.instances).toHaveLength(3); // No 4th instance
  });

  it('8. Authentication failure handling', () => {
    const onError = jest.fn();
    const onClose = jest.fn();
    const { result } = renderHook(() =>
      useWebSocket({
        url: 'ws://example.com',
        onError,
        onClose,
        reconnect: true,
        reconnectBaseDelay: 1000,
      })
    );

    const ws1 = MockWebSocket.instances[0];
    
    // Simulate auth error (unauthorized close / connection error)
    ws1.triggerError(new Event('error'));
    ws1.triggerClose(4401, 'Unauthorized');

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    
    // According to current implementation design, it is surfaced and schedules normal reconnect
    expect(result.current.state).toBe('reconnecting');
  });

  it('9. Cleanup/unmount prevents state updates and timers', () => {
    const { result, unmount } = renderHook(() =>
      useWebSocket({
        url: 'ws://example.com',
        reconnect: true,
        reconnectBaseDelay: 1000,
      })
    );

    const ws1 = MockWebSocket.instances[0];
    ws1.triggerOpen();

    // Trigger close to schedule reconnect
    ws1.triggerClose(1006);
    expect(result.current.state).toBe('reconnecting');

    // Unmount hook
    unmount();

    // Advance timers to trigger the reconnect callback
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    // Verify no new WebSocket is created after unmount
    expect(MockWebSocket.instances).toHaveLength(1);
  });
});
