/**
 * Tests for useTipStateMachine
 * Covers: pending → confirmed/failed states, Horizon polling, duplicate blocking, retry-verify,
 * reload-resume persistence, stale recovery, and cancel behavior (#1481).
 */
import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useTipStateMachine } from "@/lib/hooks/useTipStateMachine";
import { sendTip, verifyTip } from "@/lib/services/tipping.service";

jest.mock("@/lib/services/tipping.service", () => ({
  sendTip: jest.fn(),
  verifyTip: jest.fn(),
}));

const mockSendTip = sendTip as jest.MockedFunction<typeof sendTip>;
const mockVerifyTip = verifyTip as jest.MockedFunction<typeof verifyTip>;

// Mock fetch for Horizon polling
const mockFetch = jest.fn();
global.fetch = mockFetch;

const TX_HASH = "abc123def456";
const CONFESSION_ID = "confession-1";
const RECIPIENT = "GABCDEF1234567890ABCDEF1234567890ABCDEF12345678";

function makeHorizonResponse(successful: boolean) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ successful }),
  } as Response);
}

function makeHorizon404() {
  return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) } as Response);
}

function renderMachine() {
  return renderHook(() =>
    useTipStateMachine({ confessionId: CONFESSION_ID, recipientAddress: RECIPIENT }),
  );
}

// Speed up polling in tests
jest.useFakeTimers();

beforeEach(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  window.fetch = mockFetch as unknown as typeof fetch;

  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      get length() {
        return store.size;
      },
      clear: jest.fn(() => store.clear()),
      getItem: jest.fn((key: string) => store.get(key) ?? null),
      key: jest.fn((index: number) => Array.from(store.keys())[index] ?? null),
      removeItem: jest.fn((key: string) => {
        store.delete(key);
      }),
      setItem: jest.fn((key: string, value: string) => {
        store.set(key, String(value));
      }),
    },
  });
});

afterEach(() => {
  jest.clearAllMocks();
  jest.clearAllTimers();
  window.localStorage.clear();
});

const PERSIST_KEY = `xconfess:pendingTip:${CONFESSION_ID}`;

describe("useTipStateMachine", () => {
  it("starts in idle state", () => {
    const { result } = renderMachine();
    expect(result.current.info.state).toBe("idle");
    expect(result.current.info.isBusy).toBe(false);
  });

  it("goes idle → submitting → pending → verifying → confirmed on happy path", async () => {
    mockSendTip.mockResolvedValue({ success: true, txHash: TX_HASH });
    mockFetch.mockResolvedValue(makeHorizonResponse(true));
    mockVerifyTip.mockResolvedValue({ success: true });

    const { result } = renderMachine();

    let submitPromise!: Promise<void>;
    act(() => {
      submitPromise = result.current.submit(0.5);
    });

    // submitting immediately
    expect(result.current.info.state).toBe("submitting");

    // advance past sendTip
    await act(async () => {
      await Promise.resolve();
      await jest.runAllTimersAsync();
      await submitPromise;
    });

    expect(result.current.info.state).toBe("confirmed");
    expect(result.current.info.txHash).toBe(TX_HASH);
    expect(result.current.info.explorerUrl).toContain(TX_HASH);
    expect(result.current.info.explorerUrl).toContain("steexp.com");
  });

  it("enters failed state when sendTip returns success:false", async () => {
    mockSendTip.mockResolvedValue({ success: false, error: "Insufficient XLM balance." });

    const { result } = renderMachine();
    await act(async () => { await result.current.submit(0.5); });

    expect(result.current.info.state).toBe("failed");
    expect(result.current.info.error).toMatch(/insufficient/i);
    expect(result.current.info.txHash).toBeNull();
  });

  it("transitions through pending state while Horizon returns 404", async () => {
    mockSendTip.mockResolvedValue({ success: true, txHash: TX_HASH });
    // First two polls return 404, third returns confirmed
    mockFetch
      .mockResolvedValueOnce(makeHorizon404())
      .mockResolvedValueOnce(makeHorizon404())
      .mockResolvedValue(makeHorizonResponse(true));
    mockVerifyTip.mockResolvedValue({ success: true });

    const { result } = renderMachine();
    const p = act(async () => { result.current.submit(0.5); });
    await act(async () => { await jest.runAllTimersAsync(); });
    await p;

    expect(result.current.info.state).toBe("confirmed");
  });

  it("fails with network rejection message when Horizon reports successful:false", async () => {
    mockSendTip.mockResolvedValue({ success: true, txHash: TX_HASH });
    mockFetch.mockResolvedValue(makeHorizonResponse(false));

    const { result } = renderMachine();
    const p = act(async () => { result.current.submit(0.5); });
    await act(async () => { await jest.runAllTimersAsync(); });
    await p;

    expect(result.current.info.state).toBe("failed");
    expect(result.current.info.error).toMatch(/rejected by the stellar network/i);
    // txHash is still available for explorer link
    expect(result.current.info.txHash).toBe(TX_HASH);
  });

  it("blocks duplicate submissions while in-flight", async () => {
    let resolveSend!: (v: any) => void;
    const sendPromise = new Promise((r) => { resolveSend = r; });
    mockSendTip.mockReturnValue(sendPromise as any);

    const { result } = renderMachine();
    act(() => { result.current.submit(0.5); });

    // Second call while submitting — should be ignored
    act(() => { result.current.submit(0.5); });

    expect(mockSendTip).toHaveBeenCalledTimes(1);

    resolveSend({ success: false, error: "rejected" });
    await act(async () => { await jest.runAllTimersAsync(); });
  });

  it("retryVerify does not re-send the transaction", async () => {
    mockSendTip.mockResolvedValue({ success: true, txHash: TX_HASH });
    mockFetch.mockResolvedValue(makeHorizonResponse(true));
    mockVerifyTip
      .mockResolvedValueOnce({ success: false, error: "pending" })
      .mockResolvedValueOnce({ success: true });

    const { result } = renderMachine();
    const p = act(async () => { result.current.submit(0.5); });
    await act(async () => { await jest.runAllTimersAsync(); });
    await p;

    expect(result.current.info.state).toBe("failed");
    expect(result.current.info.txHash).toBe(TX_HASH);

    await act(async () => { await result.current.retryVerify(); });

    expect(result.current.info.state).toBe("confirmed");
    expect(mockSendTip).toHaveBeenCalledTimes(1); // never re-sent
    expect(mockVerifyTip).toHaveBeenCalledTimes(2);
  });

  it("reset returns to idle and clears error/hash", async () => {
    mockSendTip.mockResolvedValue({ success: false, error: "nope" });

    const { result } = renderMachine();
    await act(async () => { await result.current.submit(0.5); });
    expect(result.current.info.state).toBe("failed");

    act(() => { result.current.reset(); });
    expect(result.current.info.state).toBe("idle");
    expect(result.current.info.error).toBeNull();
    expect(result.current.info.txHash).toBeNull();
  });

  it("missing recipientAddress immediately fails without calling sendTip", async () => {
    const { result } = renderHook(() =>
      useTipStateMachine({ confessionId: CONFESSION_ID, recipientAddress: undefined }),
    );

    await act(async () => { await result.current.submit(0.5); });

    expect(result.current.info.state).toBe("failed");
    expect(result.current.info.error).toMatch(/recipient/i);
    expect(mockSendTip).not.toHaveBeenCalled();
  });

  it("explorerUrl uses testnet.steexp.com on testnet", async () => {
    mockSendTip.mockResolvedValue({ success: true, txHash: TX_HASH });
    mockFetch.mockResolvedValue(makeHorizonResponse(true));
    mockVerifyTip.mockResolvedValue({ success: true });

    const { result } = renderMachine();
    const p = act(async () => { result.current.submit(0.5); });
    await act(async () => { await jest.runAllTimersAsync(); });
    await p;

    expect(result.current.info.explorerUrl).toBe(`https://testnet.steexp.com/tx/${TX_HASH}`);
  });

  it("persists the tx hash once submitted, and clears it once confirmed", async () => {
    mockSendTip.mockResolvedValue({ success: true, txHash: TX_HASH });
    mockFetch.mockResolvedValue(makeHorizonResponse(true));
    mockVerifyTip.mockResolvedValue({ success: true });

    const { result } = renderMachine();
    const p = act(async () => { result.current.submit(0.5); });

    // pending: persisted record should now exist
    await act(async () => { await Promise.resolve(); });
    const persisted = JSON.parse(window.localStorage.getItem(PERSIST_KEY) as string);
    expect(persisted.txHash).toBe(TX_HASH);

    await act(async () => { await jest.runAllTimersAsync(); });
    await p;

    expect(result.current.info.state).toBe("confirmed");
    expect(window.localStorage.getItem(PERSIST_KEY)).toBeNull();
  });

  it("resumes verification automatically for a tip persisted before a reload", async () => {
    window.localStorage.setItem(
      PERSIST_KEY,
      JSON.stringify({ txHash: TX_HASH, amount: 0.5, submittedAt: Date.now() }),
    );
    mockVerifyTip.mockResolvedValue({ success: true });

    const { result } = renderMachine();

    await waitFor(() => expect(result.current.info.state).toBe("confirmed"));

    expect(mockSendTip).not.toHaveBeenCalled();
    expect(mockVerifyTip).toHaveBeenCalledTimes(1);
    expect(mockVerifyTip).toHaveBeenCalledWith(CONFESSION_ID, TX_HASH);
    expect(result.current.info.txHash).toBe(TX_HASH);
    expect(window.localStorage.getItem(PERSIST_KEY)).toBeNull();
  });

  it("marks a stale-recovered tip as failed when resumed verification does not succeed", async () => {
    window.localStorage.setItem(
      PERSIST_KEY,
      JSON.stringify({ txHash: TX_HASH, amount: 0.5, submittedAt: Date.now() }),
    );
    mockVerifyTip.mockResolvedValue({ success: false, error: "still pending" });

    const { result } = renderMachine();

    await waitFor(() => expect(result.current.info.state).toBe("failed"));
    expect(result.current.info.txHash).toBe(TX_HASH);
  });

  it("marks a persisted tip older than the staleness threshold as `stale` without calling verifyTip", async () => {
    const THIRTY_ONE_MINUTES_AGO = Date.now() - 31 * 60 * 1000;
    window.localStorage.setItem(
      PERSIST_KEY,
      JSON.stringify({ txHash: TX_HASH, amount: 0.5, submittedAt: THIRTY_ONE_MINUTES_AGO }),
    );

    const { result } = renderMachine();

    await waitFor(() => expect(result.current.info.state).toBe("stale"));
    expect(result.current.info.txHash).toBe(TX_HASH);
    expect(mockVerifyTip).not.toHaveBeenCalled();

    // Still recoverable — retryVerify works from the stale state.
    mockVerifyTip.mockResolvedValue({ success: true });
    await act(async () => { await result.current.retryVerify(); });
    expect(result.current.info.state).toBe("confirmed");
  });

  it("does not call verifyTip more than once when the resume effect double-invokes (StrictMode)", async () => {
    window.localStorage.setItem(
      PERSIST_KEY,
      JSON.stringify({ txHash: TX_HASH, amount: 0.5, submittedAt: Date.now() }),
    );
    let resolveVerify!: (v: any) => void;
    mockVerifyTip.mockReturnValue(new Promise((r) => { resolveVerify = r; }) as any);

    renderHook(
      () => useTipStateMachine({ confessionId: CONFESSION_ID, recipientAddress: RECIPIENT }),
      { wrapper: React.StrictMode },
    );

    await act(async () => { await Promise.resolve(); });
    expect(mockVerifyTip).toHaveBeenCalledTimes(1);

    resolveVerify({ success: true });
    await act(async () => { await Promise.resolve(); });
  });

  it("cancel() during pending stops further processing and preserves the tx hash for recovery", async () => {
    mockSendTip.mockResolvedValue({ success: true, txHash: TX_HASH });
    mockFetch.mockResolvedValue(makeHorizonResponse(true));

    const { result } = renderMachine();
    act(() => { result.current.submit(0.5); });

    await act(async () => { await Promise.resolve(); });
    expect(result.current.info.state).toBe("pending");

    act(() => { result.current.cancel(); });

    expect(result.current.info.state).toBe("failed");
    expect(result.current.info.txHash).toBe(TX_HASH);

    // Draining any in-flight polling/timers must not flip the state again.
    await act(async () => { await jest.runAllTimersAsync(); });
    expect(result.current.info.state).toBe("failed");
    expect(mockVerifyTip).not.toHaveBeenCalled();
  });

  it("cancel() before a tx hash exists returns to idle", async () => {
    let resolveSend!: (v: any) => void;
    mockSendTip.mockReturnValue(new Promise((r) => { resolveSend = r; }) as any);

    const { result } = renderMachine();
    act(() => { result.current.submit(0.5); });
    expect(result.current.info.state).toBe("submitting");

    act(() => { result.current.cancel(); });
    expect(result.current.info.state).toBe("idle");
    expect(result.current.info.txHash).toBeNull();

    resolveSend({ success: true, txHash: TX_HASH });
    await act(async () => { await jest.runAllTimersAsync(); });
    // The late resolution must not resurrect state after cancellation.
    expect(result.current.info.state).toBe("idle");
  });

  it("reset clears the persisted tip so a stale record cannot resurrect on the next mount", async () => {
    mockSendTip.mockResolvedValue({ success: false, error: "nope" });

    const { result } = renderMachine();
    await act(async () => { await result.current.submit(0.5); });

    window.localStorage.setItem(
      PERSIST_KEY,
      JSON.stringify({ txHash: TX_HASH, amount: 0.5, submittedAt: Date.now() }),
    );
    act(() => { result.current.reset(); });

    expect(window.localStorage.getItem(PERSIST_KEY)).toBeNull();
  });
});
