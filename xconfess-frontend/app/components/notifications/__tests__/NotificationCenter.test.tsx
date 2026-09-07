import { render, screen, fireEvent } from "@testing-library/react";
import { NotificationCenter } from "../NotificationCenter";
import { ToastProvider } from "@/app/components/common/Toast";
import { NotificationType, type Notification } from "@/app/types/notifications";

// Stable, backend-free mocks for the notification center UI states.
jest.mock("@/app/lib/hooks/useNotifications", () => ({
  useNotifications: () => stateHolder.current,
}));

jest.mock("@/app/lib/api/notification", () => ({
  notificationApi: {
    getNotifications: jest.fn(),
    markAsRead: jest.fn(),
    markAllAsRead: jest.fn(),
    deleteNotification: jest.fn(),
    getPreferences: jest.fn(() =>
      Promise.resolve({
        userId: "current-user-id",
        reaction: true,
        comment: true,
        tip: true,
        badge: true,
        mention: true,
        follow: true,
        emailNotifications: false,
        pushNotifications: true,
      }),
    ),
    updatePreferences: jest.fn(() => Promise.resolve({})),
  },
}));

const stateHolder: { current: Record<string, unknown> } = { current: {} };

const mockMarkAsRead = jest.fn();
const mockMarkAllAsRead = jest.fn();
const mockFetchNotifications = jest.fn();
const mockDeleteNotification = jest.fn();

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: "n-1",
    userId: "current-user-id",
    type: NotificationType.REACTION,
    title: "New reaction on your confession",
    message: "@crypto_saint reacted 🔥",
    metadata: {},
    isRead: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function setState(notifications: Notification[], unreadCount = notifications.filter((n) => !n.isRead).length) {
  stateHolder.current = {
    notifications,
    unreadCount,
    isConnected: false,
    loading: false,
    markAsRead: mockMarkAsRead,
    markAllAsRead: mockMarkAllAsRead,
    fetchNotifications: mockFetchNotifications,
    deleteNotification: mockDeleteNotification,
  };
}

function renderCenter() {
  return render(
    <ToastProvider>
      <NotificationCenter />
    </ToastProvider>,
  );
}

beforeEach(() => {
  mockMarkAsRead.mockReset();
  mockMarkAllAsRead.mockReset();
  mockFetchNotifications.mockReset();
  mockDeleteNotification.mockReset();
  setState([]);
});

describe("NotificationCenter", () => {
  test("renders the empty state when there are no notifications", () => {
    setState([]);
    renderCenter();

    expect(screen.getByText("No notifications yet")).toBeInTheDocument();
    expect(
      screen.getByText("Activity on your confessions will show up here"),
    ).toBeInTheDocument();
  });

  test("renders the unread state with a mark-all-read control", () => {
    setState([
      makeNotification({ id: "n-1", isRead: false }),
      makeNotification({ id: "n-2", isRead: false }),
      makeNotification({ id: "n-3", isRead: true }),
    ]);
    renderCenter();

    expect(screen.getByText("2 unread notifications")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark all read" })).toBeInTheDocument();
    expect(screen.getByText("New reaction on your confession")).toBeInTheDocument();
  });

  test("read-all state hides the unread controls", () => {
    setState(
      [
        makeNotification({ id: "n-1", isRead: true }),
        makeNotification({ id: "n-2", isRead: true }),
      ],
      0,
    );
    renderCenter();

    expect(screen.queryByText(/unread notification/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark all read" })).not.toBeInTheDocument();
  });

  test("clicking mark all read invokes the handler", () => {
    setState([makeNotification({ id: "n-1", isRead: false })]);
    renderCenter();

    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
    expect(mockMarkAllAsRead).toHaveBeenCalledTimes(1);
  });

  test("opens the preferences panel", () => {
    setState([makeNotification({ id: "n-1", isRead: false })]);
    renderCenter();

    fireEvent.click(screen.getByRole("button", { name: "Notification settings" }));
    expect(screen.getByText(/notification preferences/i)).toBeInTheDocument();
  });

  test("deleting a notification invokes the handler", () => {
    setState([
      makeNotification({ id: "n-1", isRead: false }),
      makeNotification({ id: "n-2", isRead: true }),
    ]);
    renderCenter();

    const deleteButtons = screen.getAllByRole("button", { name: "Delete notification" });
    fireEvent.click(deleteButtons[0]);
    expect(mockDeleteNotification).toHaveBeenCalledWith("n-1");
  });
});
