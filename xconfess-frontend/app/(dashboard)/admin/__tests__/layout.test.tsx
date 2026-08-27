/**
 * Regression tests for the admin layout auth guard.
 *
 * Security requirement:
 * - The layout must rely on session-backed auth state, not localStorage user mocks.
 * - NEXT_PUBLIC_DEV_BYPASS_AUTH may only bypass auth when NODE_ENV === "development".
 */

import React from "react";
import { render, waitFor } from "@testing-library/react";
import { useAuth } from "@/app/lib/hooks/useAuth";

const mockReplace = jest.fn();
const mockGetItem = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => "/admin/dashboard",
}));

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: jest.fn(),
    setQueriesData: jest.fn(),
  }),
}));

jest.mock("socket.io-client", () => ({
  io: () => ({
    on: jest.fn(),
    disconnect: jest.fn(),
  }),
}));

jest.mock("@/app/lib/api/constants", () => ({
  AUTH_TOKEN_KEY: "auth_token",
}));

jest.mock("@/app/lib/hooks/useFocusTrap", () => ({
  useFocusTrap: jest.fn(),
}));

jest.mock("@/app/lib/config", () => ({
  getApiBaseUrl: () => "http://localhost:5000",
}));

jest.mock("@/app/lib/hooks/useAuth", () => ({
  useAuth: jest.fn(),
}));

const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

function setAuthState(overrides?: Partial<ReturnType<typeof useAuth>>) {
  mockedUseAuth.mockReturnValue({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(),
    checkAuth: jest.fn(),
    ...overrides,
  });
}

async function renderLayout() {
  const { default: AdminLayout } = await import("../layout");
  return render(<AdminLayout>content</AdminLayout>);
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH;
  Object.defineProperty(window, "localStorage", {
    value: {
      getItem: mockGetItem.mockReturnValue(null),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    },
    writable: true,
  });
  setAuthState();
});

describe("isDevBypassEnabled - production guard", () => {
  it("is always false when NODE_ENV is not development", async () => {
    expect(process.env.NODE_ENV).not.toBe("development");
    process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH = "true";

    await renderLayout();

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/login");
    });
  });

  it("never checks a localStorage admin mock toggle", async () => {
    mockGetItem.mockImplementation((key: string) =>
      key === "adminMock" ? "true" : null,
    );

    await renderLayout();

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/login");
    });
    expect(mockGetItem).not.toHaveBeenCalledWith("adminMock");
  });
});

describe("Admin layout - authentication redirect behaviour", () => {
  it("redirects to /login when no authenticated user is present", async () => {
    setAuthState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });

    await renderLayout();

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/login");
    });
  });

  it("redirects to /dashboard when the authenticated user is not an admin", async () => {
    setAuthState({
      user: {
        id: "2",
        username: "alice",
        email: "alice@example.com",
        role: "user",
        is_active: true,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
      isAuthenticated: true,
      isLoading: false,
    });

    await renderLayout();

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("does not redirect when the authenticated user is an admin", async () => {
    setAuthState({
      user: {
        id: "1",
        username: "admin",
        email: "admin@example.com",
        role: "admin",
        is_active: true,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
      isAuthenticated: true,
      isLoading: false,
    });

    await renderLayout();

    await waitFor(() => {
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  it("does not write admin state into localStorage", async () => {
    await renderLayout();

    expect(window.localStorage.setItem).not.toHaveBeenCalled();
  });

  it("does not redirect while authentication is still loading", async () => {
    setAuthState({ user: null, isAuthenticated: false, isLoading: true });

    await renderLayout();

    // Redirect must not fire while the session is being resolved
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("redirects to /login after loading completes with no session", async () => {
    setAuthState({ user: null, isAuthenticated: false, isLoading: false });

    await renderLayout();

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/login");
    });
  });
});
