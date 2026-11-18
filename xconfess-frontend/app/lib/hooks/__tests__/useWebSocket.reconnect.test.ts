/**
 * @jest-environment jsdom
 *
 * Tests for:
 *   #2183 — WebSocket reconnects without duplicate subscriptions
 *   #2184 — Connection status visibility
 */
import { renderHook, act } from '@testing-library/react';
import { useWebSocket } from '../useWebSocket';

class MockWebSocket {
  url: string;
  readyState: number = 0;
  onopen: (() => void) | null = null;
  onclose: ((event: Partial<CloseEvent>) => void) | null = null;
  onerror: ((error: Event) => void) | null = null;
  onmessage: ((event: Partial<MessageEvent>) => void) | null = null;
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
    this.readyState = 1;
    act(() => { this.onopen?.(); });
  }

  triggerClose(code = 1006, reason = '') {
    this.readyState = 3;
    act(() => { this.onclose?.({ code, reason, wasClean: code === 1000 }); });
  }

  triggerMessage(data: unknown) {
    const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
    act(() => { this.onmessage?.({ data: dataStr }); });
  }
}

describe('WebSocket — reconnect without duplicate subscriptions (#2183)', () => {
  let origWS: typeof WebSocket;

  beforeAll(() => {
    origWS = global.WebSocket;
    global.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  });

  afterAll(() => { global.WebSocket = origWS; });

  beforeEach(() => {
    MockWebSocket.instances = [];
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('ignores messages from a stale socket after reconnect', () => {
    const onMessage = jest.fn();
    renderHook(() =>
      useWebSocket({ url: 'ws://test', onMessage, reconnect: true, reconnectBaseDelay: 100 })
    );

    const ws1 = MockWebSocket.instances[0];
    ws1.triggerOpen();

    ws1.triggerClose(1006);
    act(() => { jest.advanceTimersByTime(200); });

    const ws2 = MockWebSocket.instances[1];
    ws2.triggerOpen();

    // Message on new socket — should be delivered
    ws2.triggerMessage({ type: 'ping', payload: {} });
    expect(onMessage).toHaveBeenCalledTimes(1);

    // Message on stale old socket — must be ignored
    ws1.triggerMessage({ type: 'ping', payload: {} });
    expect(onMessage).toHaveBeenCalledTimes(1);
  });

  it('creates exactly one new WebSocket per reconnect attempt', () => {
    renderHook(() =>
      useWebSocket({ url: 'ws://test', reconnect: true, reconnectBaseDelay: 100 })
    );

    const ws1 = MockWebSocket.instances[0];
    ws1.triggerOpen();
    ws1.triggerClose(1006);

    act(() => { jest.advanceTimersByTime(200); });
    expect(MockWebSocket.instances).toHaveLength(2);

    MockWebSocket.instances[1].triggerOpen();
    MockWebSocket.instances[1].triggerClose(1006);

    act(() => { jest.advanceTimersByTime(400); });
    expect(MockWebSocket.instances).toHaveLength(3);
  });

  it('stops reconnecting after maxReconnectAttempts', () => {
    renderHook(() =>
      useWebSocket({ url: 'ws://test', reconnect: true, maxReconnectAttempts: 2, reconnectBaseDelay: 100 })
    );

    const ws1 = MockWebSocket.instances[0];
    ws1.triggerOpen();
    ws1.triggerClose(1006);

    act(() => { jest.advanceTimersByTime(200); });
    MockWebSocket.instances[1].triggerClose(1006);

    act(() => { jest.advanceTimersByTime(400); });
    MockWebSocket.instances[2].triggerClose(1006);

    // No more reconnects after 2 attempts
    act(() => { jest.advanceTimersByTime(60000); });
    expect(MockWebSocket.instances).toHaveLength(3);
  });

  it('cleans up listeners and closes socket on unmount', () => {
    const onMessage = jest.fn();
    const { unmount } = renderHook(() =>
      useWebSocket({ url: 'ws://test', onMessage, reconnect: true, reconnectBaseDelay: 100 })
    );

    const ws1 = MockWebSocket.instances[0];
    ws1.triggerOpen();
    ws1.triggerClose(1006);

    unmount();

    act(() => { jest.advanceTimersByTime(200); });
    // No new socket created after unmount
    expect(MockWebSocket.instances).toHaveLength(1);

    // Messages on the closed socket do not reach the handler
    ws1.triggerMessage({ type: 'ping', payload: {} });
    expect(onMessage).not.toHaveBeenCalled();
  });

  it('does not reconnect when enabled is false', () => {
    renderHook(() =>
      useWebSocket({ url: 'ws://test', reconnect: true, enabled: false })
    );

    // Hook should not create a WebSocket when disabled
    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it('deduplicates events with the same id within the deduplication window', () => {
    const onMessage = jest.fn();
    renderHook(() =>
      useWebSocket({ url: 'ws://test', onMessage, deduplicationWindowMs: 60000 })
    );

    const ws1 = MockWebSocket.instances[0];
    ws1.triggerOpen();

    ws1.triggerMessage({ id: 'evt-1', type: 'ping', payload: {} });
    ws1.triggerMessage({ id: 'evt-1', type: 'ping', payload: {} }); // duplicate
    ws1.triggerMessage({ id: 'evt-2', type: 'ping', payload: {} });

    // evt-1 delivered once, evt-2 delivered once
    expect(onMessage).toHaveBeenCalledTimes(2);
  });

  it('does not duplicate events after reconnect when event ids match', () => {
    const onMessage = jest.fn();
    renderHook(() =>
      useWebSocket({
        url: 'ws://test',
        onMessage,
        reconnect: true,
        reconnectBaseDelay: 100,
        deduplicationWindowMs: 60000,
      })
    );

    const ws1 = MockWebSocket.instances[0];
    ws1.triggerOpen();
    ws1.triggerMessage({ id: 'evt-1', type: 'new_message', payload: {} });

    ws1.triggerClose(1006);
    act(() => { jest.advanceTimersByTime(200); });

    const ws2 = MockWebSocket.instances[1];
    ws2.triggerOpen();
    // Server replays the same event after reconnect — should be deduplicated
    ws2.triggerMessage({ id: 'evt-1', type: 'new_message', payload: {} });

    expect(onMessage).toHaveBeenCalledTimes(1);
  });

  it('does not reconnect when callback props change identity (stable callback refs)', () => {
    let callCount = 0;
    // Simulate a parent re-rendering with a new callback reference each render
    const { rerender } = renderHook(
      ({ cb }) => useWebSocket({ url: 'ws://test', onMessage: cb }),
      { initialProps: { cb: () => { callCount++; } } }
    );

    const ws1 = MockWebSocket.instances[0];
    ws1.triggerOpen();
    const instanceCountBefore = MockWebSocket.instances.length;

    // Re-render with a new callback reference (simulates parent re-render)
    rerender({ cb: () => { callCount++; } });
    rerender({ cb: () => { callCount++; } });

    // No new WebSocket should have been created
    expect(MockWebSocket.instances).toHaveLength(instanceCountBefore);
  });
});

describe('WebSocket — connection status visibility (#2184)', () => {
  let origWS: typeof WebSocket;

  beforeAll(() => {
    origWS = global.WebSocket;
    global.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  });

  afterAll(() => { global.WebSocket = origWS; });

  beforeEach(() => {
    MockWebSocket.instances = [];
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('transitions connecting → connected → reconnecting → connected', () => {
    const states: string[] = [];
    const { result } = renderHook(() =>
      useWebSocket({
        url: 'ws://test',
        reconnect: true,
        reconnectBaseDelay: 100,
        onStateChange: (s) => states.push(s),
      })
    );

    expect(result.current.state).toBe('connecting');

    MockWebSocket.instances[0].triggerOpen();
    expect(result.current.state).toBe('connected');

    MockWebSocket.instances[0].triggerClose(1006);
    expect(result.current.state).toBe('reconnecting');

    act(() => { jest.advanceTimersByTime(200); });
    MockWebSocket.instances[1].triggerOpen();
    expect(result.current.state).toBe('connected');

    expect(states).toEqual(['connecting', 'connected', 'disconnected', 'reconnecting', 'connecting', 'connected']);
  });

  it('exposes reconnectAttempts count during reconnection', () => {
    const { result } = renderHook(() =>
      useWebSocket({ url: 'ws://test', reconnect: true, reconnectBaseDelay: 100, maxReconnectAttempts: 5 })
    );

    MockWebSocket.instances[0].triggerOpen();
    expect(result.current.reconnectAttempts).toBe(0);

    MockWebSocket.instances[0].triggerClose(1006);
    expect(result.current.reconnectAttempts).toBe(1);

    act(() => { jest.advanceTimersByTime(200); });
    MockWebSocket.instances[1].triggerClose(1006);
    expect(result.current.reconnectAttempts).toBe(2);
  });

  it('reaches disconnected state with full reconnect count after exhausting attempts', () => {
    const { result } = renderHook(() =>
      useWebSocket({ url: 'ws://test', reconnect: true, maxReconnectAttempts: 1, reconnectBaseDelay: 100 })
    );

    MockWebSocket.instances[0].triggerOpen();
    MockWebSocket.instances[0].triggerClose(1006);

    act(() => { jest.advanceTimersByTime(200); });
    MockWebSocket.instances[1].triggerClose(1006);

    expect(result.current.state).toBe('disconnected');
    expect(result.current.reconnectAttempts).toBe(1);
  });

  it('forceReconnect resets attempt count and reconnects', () => {
    const { result } = renderHook(() =>
      useWebSocket({ url: 'ws://test', reconnect: true, maxReconnectAttempts: 1, reconnectBaseDelay: 100 })
    );

    MockWebSocket.instances[0].triggerOpen();
    MockWebSocket.instances[0].triggerClose(1006);
    act(() => { jest.advanceTimersByTime(200); });
    MockWebSocket.instances[1].triggerClose(1006);

    // Exhausted — now force reconnect
    act(() => { result.current.forceReconnect(); });
    act(() => { jest.advanceTimersByTime(200); });

    expect(MockWebSocket.instances.length).toBeGreaterThanOrEqual(3);
    MockWebSocket.instances[MockWebSocket.instances.length - 1].triggerOpen();
    expect(result.current.state).toBe('connected');
    expect(result.current.reconnectAttempts).toBe(0);
  });
});
