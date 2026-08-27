import { act, renderHook, waitFor } from "@testing-library/react";
import { useNotifications } from "../useNotifications";
import { notificationApi } from "@/app/lib/api/notification";
import type { Notification } from "@/app/types/notifications";
import { NotificationType } from "@/app/types/notifications";

// ---------------------------------------------------------------------------
// Socket.IO mock
// ---------------------------------------------------------------------------
let socketHandlers: Record<string, (...args: unknown[]) => void> = {};

const mockSocket = {
  on: jest.fn(),
  emit: jest.fn(),
  disconnect: jest.fn(),
};

jest.mock("socket.io-client", () => ({
  io: jest.fn(() => mockSocket),
}));

function triggerSocketEvent(event: string, ...args: unknown[]) {
  socketHandlers[event]?.(...args);
}

// ---------------------------------------------------------------------------
// API mock
// ---------------------------------------------------------------------------
jest.mock("@/app/lib/api/notification", () => ({
  notificationApi: {
    getNotifications: jest.fn(),
    markAsRead: jest.fn(),
    markAllAsRead: jest.fn(),
    deleteNotification: jest.fn(),
    getPreferences: jest.fn(),
    updatePreferences: jest.fn(),
  },
}));

const mockGetNotifications = notificationApi.getNotifications as jest.Mock;
const mockMarkAsRead = notificationApi.markAsRead as jest.Mock;
const mockMarkAllAsRead = notificationApi.markAllAsRead as jest.Mock;

// ---------------------------------------------------------------------------
// Other deps
// ---------------------------------------------------------------------------
jest.mock("@/app/lib/hooks/useApiError", () => ({
  useApiError: () => ({ handleError: jest.fn() }),
}));

jest.mock("@/app/lib/config", () => ({
  getWsUrl: () => "ws://localhost:5000",
}));

// ---------------------------------------------------------------------------
// Browser API stubs
// ---------------------------------------------------------------------------
beforeAll(() => {
  // Audio stub — jsdom doesn't implement HTMLMediaElement playback
  Object.defineProperty(globalThis, "Audio", {
    writable: true,
    value: jest.fn().mockImplementation(() => ({
      volume: 0,
      play: jest.fn().mockResolvedValue(undefined),
    })),
  });

  // Notification stub
  Object.defineProperty(globalThis, "Notification", {
    writable: true,
    value: Object.assign(jest.fn(), { permission: "default", requestPermission: jest.fn() }),
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: "notif-1",
    userId: "user-1",
    type: NotificationType.COMMENT,
    title: "New comment",
    message: "Someone commented",
    isRead: false,
    createdAt: new Date().toISOString(),
    metadata: {},
    ...overrides,
  };
}

function makePaginatedResponse(notifications: Notification[], unreadCount = notifications.length) {
  return {
    notifications,
    unreadCount,
    total: notifications.length,
    page: 1,
    limit: 20,
    totalPages: 1,
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------
beforeEach(() => {
  socketHandlers = {};
  jest.clearAllMocks();

  // Re-attach handler-capture implementation each time (clearAllMocks wipes calls but not impl;
  // explicit re-attach makes the intent clear and survives potential resetAllMocks usage).
  mockSocket.on.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
    socketHandlers[event] = handler;
  });

  // Default: getNotifications resolves with empty list
  mockGetNotifications.mockResolvedValue(makePaginatedResponse([]));
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("useNotifications — reconnect reconciliation", () => {
  it("does NOT call getNotifications on the first connect", async () => {
    renderHook(() => useNotifications("user-1"));

    await act(async () => {
      triggerSocketEvent("connect");
    });

    expect(mockGetNotifications).not.toHaveBeenCalled();
  });

  it("calls getNotifications after a socket reconnect", async () => {
    const freshNotif = makeNotification({ id: "notif-new" });
    mockGetNotifications.mockResolvedValue(makePaginatedResponse([freshNotif], 1));

    renderHook(() => useNotifications("user-1"));

    // First connect — marks hasConnectedRef = true, no fetch
    await act(async () => {
      triggerSocketEvent("connect");
    });

    expect(mockGetNotifications).not.toHaveBeenCalled();

    // Simulate drop
    await act(async () => {
      triggerSocketEvent("disconnect");
    });

    // Reconnect — should trigger a reconcile fetch
    await act(async () => {
      triggerSocketEvent("connect");
    });

    await waitFor(() => expect(mockGetNotifications).toHaveBeenCalledTimes(1));
  });

  it("updates notifications and unreadCount from API response after reconnect", async () => {
    const missed = makeNotification({ id: "missed-1", isRead: false });
    mockGetNotifications.mockResolvedValue(makePaginatedResponse([missed], 1));

    const { result } = renderHook(() => useNotifications("user-1"));

    await act(async () => {
      triggerSocketEvent("connect");
      triggerSocketEvent("disconnect");
      triggerSocketEvent("connect");
    });

    await waitFor(() => {
      expect(result.current.notifications).toHaveLength(1);
      expect(result.current.notifications[0].id).toBe("missed-1");
      expect(result.current.unreadCount).toBe(1);
    });
  });

  it("handles multiple reconnects, fetching each time", async () => {
    renderHook(() => useNotifications("user-1"));

    // First connect
    await act(async () => { triggerSocketEvent("connect"); });
    // 1st reconnect
    await act(async () => { triggerSocketEvent("disconnect"); triggerSocketEvent("connect"); });
    // 2nd reconnect
    await act(async () => { triggerSocketEvent("disconnect"); triggerSocketEvent("connect"); });

    await waitFor(() => expect(mockGetNotifications).toHaveBeenCalledTimes(2));
  });
});

// ---------------------------------------------------------------------------
describe("useNotifications — visibility reconciliation", () => {
  it("calls getNotifications when the tab becomes visible", async () => {
    renderHook(() => useNotifications("user-1"));

    // Hide tab then show it
    await act(async () => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(mockGetNotifications).not.toHaveBeenCalled();

    await act(async () => {
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => expect(mockGetNotifications).toHaveBeenCalledTimes(1));
  });

  it("does not fetch when the tab becomes hidden", async () => {
    renderHook(() => useNotifications("user-1"));

    await act(async () => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(mockGetNotifications).not.toHaveBeenCalled();
  });

  it("syncs unreadCount from API after tab becomes visible", async () => {
    const notif = makeNotification({ id: "n1", isRead: true });
    mockGetNotifications.mockResolvedValue(makePaginatedResponse([notif], 0));

    const { result } = renderHook(() => useNotifications("user-1"));

    await act(async () => {
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => {
      expect(result.current.unreadCount).toBe(0);
      expect(result.current.notifications[0].isRead).toBe(true);
    });
  });

  it("removes the visibilitychange listener on unmount", async () => {
    const removeSpy = jest.spyOn(document, "removeEventListener");
    const { unmount } = renderHook(() => useNotifications("user-1"));

    unmount();

    expect(removeSpy).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    removeSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
describe("useNotifications — markAllAsRead", () => {
  it("marks every notification as read and zeros the unread count", async () => {
    const n1 = makeNotification({ id: "n1", isRead: false });
    const n2 = makeNotification({ id: "n2", isRead: false });
    mockGetNotifications.mockResolvedValue(makePaginatedResponse([n1, n2], 2));
    mockMarkAllAsRead.mockResolvedValue(undefined);

    const { result } = renderHook(() => useNotifications("user-1"));

    // Populate state via fetchNotifications
    await act(async () => {
      await result.current.fetchNotifications();
    });

    expect(result.current.unreadCount).toBe(2);

    await act(async () => {
      await result.current.markAllAsRead();
    });

    expect(result.current.unreadCount).toBe(0);
    expect(result.current.notifications.every((n) => n.isRead)).toBe(true);
  });

  it("does not mutate local state when the API call fails", async () => {
    const n1 = makeNotification({ id: "n1", isRead: false });
    mockGetNotifications.mockResolvedValue(makePaginatedResponse([n1], 1));
    mockMarkAllAsRead.mockRejectedValue(new Error("server error"));

    const { result } = renderHook(() => useNotifications("user-1"));

    await act(async () => {
      await result.current.fetchNotifications();
    });

    await act(async () => {
      await result.current.markAllAsRead();
    });

    // State should be unchanged because the API failed
    expect(result.current.unreadCount).toBe(1);
    expect(result.current.notifications[0].isRead).toBe(false);
  });

  it("clears the badge even when only a partial page of notifications is loaded", async () => {
    // Backend has 50 notifications; we only loaded page 1 (20 items).
    // markAllAsRead should still zero the badge and flip every loaded item.
    const loaded = Array.from({ length: 20 }, (_, i) =>
      makeNotification({ id: `n${i}`, isRead: false })
    );
    mockGetNotifications.mockResolvedValue(makePaginatedResponse(loaded, 50));
    mockMarkAllAsRead.mockResolvedValue(undefined);

    const { result } = renderHook(() => useNotifications("user-1"));

    await act(async () => { await result.current.fetchNotifications(); });
    await act(async () => { await result.current.markAllAsRead(); });

    expect(result.current.unreadCount).toBe(0);
    expect(result.current.notifications.every((n) => n.isRead)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe("useNotifications — markAsRead (single)", () => {
  it("marks one notification as read and decrements the unread count", async () => {
    const n1 = makeNotification({ id: "n1", isRead: false });
    const n2 = makeNotification({ id: "n2", isRead: false });
    mockGetNotifications.mockResolvedValue(makePaginatedResponse([n1, n2], 2));
    mockMarkAsRead.mockResolvedValue(undefined);

    const { result } = renderHook(() => useNotifications("user-1"));

    await act(async () => { await result.current.fetchNotifications(); });
    await act(async () => { await result.current.markAsRead("n1"); });

    const updated = result.current.notifications.find((n) => n.id === "n1");
    expect(updated?.isRead).toBe(true);
    expect(result.current.notifications.find((n) => n.id === "n2")?.isRead).toBe(false);
    expect(result.current.unreadCount).toBe(1);
  });

  it("does not mutate state when markAsRead API call fails", async () => {
    const n1 = makeNotification({ id: "n1", isRead: false });
    mockGetNotifications.mockResolvedValue(makePaginatedResponse([n1], 1));
    mockMarkAsRead.mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => useNotifications("user-1"));

    await act(async () => { await result.current.fetchNotifications(); });
    await act(async () => { await result.current.markAsRead("n1"); });

    expect(result.current.notifications[0].isRead).toBe(false);
    expect(result.current.unreadCount).toBe(1);
  });

  it("does not let unreadCount go below zero", async () => {
    // Edge case: notification is already read on backend but local count is 0
    const n1 = makeNotification({ id: "n1", isRead: false });
    mockGetNotifications.mockResolvedValue(makePaginatedResponse([n1], 0));
    mockMarkAsRead.mockResolvedValue(undefined);

    const { result } = renderHook(() => useNotifications("user-1"));

    await act(async () => { await result.current.fetchNotifications(); });
    await act(async () => { await result.current.markAsRead("n1"); });

    expect(result.current.unreadCount).toBe(0);
  });
});
