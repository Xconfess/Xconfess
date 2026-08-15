/**
 * Deterministic Session Recovery Tests
 * 
 * Tests for Issue #800: Make dashboard auth recovery deterministic after expired session or backend 401
 * 
 * Covers:
 * 1. Session expiry detection and deterministic recovery UI
 * 2. Refresh scenarios with expired sessions
 * 3. Deep-link access with expired sessions  
 * 4. Mid-navigation expiry scenarios
 * 5. Consistent behavior across all entry points
 */
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

// ---------- mocks ----------

const mockPush = jest.fn();
const mockPathname = jest.fn().mockReturnValue("/dashboard");

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  usePathname: () => mockPathname(),
}));

type MockAuthState = {
  isAuthenticated: boolean;
  isLoading: boolean;
  isSessionExpired: boolean;
  user: { username: string; email: string; role: string } | null;
  login: jest.Mock;
  logout: jest.Mock;
  register: jest.Mock;
  checkAuth: jest.Mock;
  error: string | null;
};

const authenticatedState: MockAuthState = {
  isAuthenticated: true,
  isLoading: false,
  isSessionExpired: false,
  user: { username: "testuser", email: "test@example.com", role: "user" },
  login: jest.fn(),
  logout: jest.fn(),
  register: jest.fn(),
  checkAuth: jest.fn(),
  error: null,
};

let mockAuthState: MockAuthState = { ...authenticatedState };

jest.mock("@/app/lib/hooks/useAuth", () => ({
  useAuth: () => mockAuthState,
}));

import { AuthGuard } from "@/app/components/AuthGuard";

// ---------- helpers ----------

function renderGuard(children: ReactNode = <div>Protected Content</div>) {
  return render(<AuthGuard>{children}</AuthGuard>);
}

// ---------- test suites ----------

describe("Deterministic Session Recovery (#800)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockPush.mockClear();
    mockPathname.mockReturnValue("/dashboard");
    mockAuthState = { ...authenticatedState };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── 1. Session Expiry Detection ──────────────────────────────────

  describe("session expiry detection", () => {
    it("shows session expired UI immediately when isSessionExpired is true", () => {
      mockAuthState = {
        ...mockAuthState,
        isAuthenticated: false,
        isLoading: false,
        isSessionExpired: true,
        user: null,
      };

      renderGuard();

      expect(screen.getByText("Session Expired")).toBeInTheDocument();
      expect(
        screen.getByText(/your session has expired/i)
      ).toBeInTheDocument();
      expect(screen.getByText("Go to Login")).toBeInTheDocument();
      expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("does not show session expired UI when isSessionExpired is false", () => {
      mockAuthState = {
        ...mockAuthState,
        isAuthenticated: false,
        isLoading: false,
        isSessionExpired: false,
        user: null,
      };

      renderGuard();

      expect(screen.queryByText("Session Expired")).not.toBeInTheDocument();
    });

    it("shows session expired UI immediately when session is expired, regardless of loading state", () => {
      mockAuthState = {
        ...mockAuthState,
        isAuthenticated: false,
        isLoading: true,
        isSessionExpired: true,
        user: null,
      };

      renderGuard();

      expect(screen.getByText("Session Expired")).toBeInTheDocument();
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });
  });

  // ── 2. Refresh Scenarios ────────────────────────────────────────

  describe("refresh scenarios", () => {
    it("handles page refresh with expired session deterministically", async () => {
      // Simulate page refresh: starts loading, then discovers expired session
      mockAuthState = {
        ...mockAuthState,
        isAuthenticated: false,
        isLoading: true,
        isSessionExpired: false,
        user: null,
      };

      const { rerender } = renderGuard();

      // Initially shows loading
      expect(screen.getByText("Loading...")).toBeInTheDocument();

      // Auth check completes with expired session
      mockAuthState = {
        ...mockAuthState,
        isAuthenticated: false,
        isLoading: false,
        isSessionExpired: true,
        user: null,
      };

      rerender(<AuthGuard><div>Protected Content</div></AuthGuard>);

      // Should show session expired UI, not redirect
      expect(screen.getByText("Session Expired")).toBeInTheDocument();
      expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("handles page refresh with valid session normally", async () => {
      // Simulate page refresh: starts loading, then confirms valid session
      mockAuthState = {
        ...mockAuthState,
        isAuthenticated: false,
        isLoading: true,
        isSessionExpired: false,
        user: null,
      };

      const { rerender } = renderGuard();

      // Initially shows loading
      expect(screen.getByText("Loading...")).toBeInTheDocument();

      // Auth check completes with valid session
      mockAuthState = authenticatedState;

      rerender(<AuthGuard><div>Protected Content</div></AuthGuard>);

      // Should show protected content
      expect(screen.getByText("Protected Content")).toBeInTheDocument();
      expect(screen.queryByText("Session Expired")).not.toBeInTheDocument();
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  // ── 3. Deep-Link Scenarios ───────────────────────────────────────

  describe("deep-link scenarios", () => {
    it("handles deep-link to protected route with expired session", () => {
      mockPathname.mockReturnValue("/dashboard/settings");
      mockAuthState = {
        ...mockAuthState,
        isAuthenticated: false,
        isLoading: false,
        isSessionExpired: true,
        user: null,
      };

      renderGuard();

      // Should show session expired UI regardless of pathname
      expect(screen.getByText("Session Expired")).toBeInTheDocument();
      expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("handles deep-link to protected route with no session", async () => {
      mockPathname.mockReturnValue("/dashboard/confessions");
      mockAuthState = {
        ...mockAuthState,
        isAuthenticated: false,
        isLoading: false,
        isSessionExpired: false,
        user: null,
      };

      renderGuard();

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/login?returnTo=%2Fdashboard%2Fconfessions");
      });
    });
  });

  // ── 4. Mid-Navigation Expiry ──────────────────────────────────────

  describe("mid-navigation expiry scenarios", () => {
    it("handles session expiry during user navigation", async () => {
      // Start with valid session
      const { rerender } = renderGuard();
      expect(screen.getByText("Protected Content")).toBeInTheDocument();

      // Session expires during navigation (e.g., API call returns 401)
      mockAuthState = {
        ...mockAuthState,
        isAuthenticated: false,
        isLoading: false,
        isSessionExpired: true,
        user: null,
      };

      rerender(<AuthGuard><div>Protected Content</div></AuthGuard>);

      // Should immediately show session expired UI
      expect(screen.getByText("Session Expired")).toBeInTheDocument();
      expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("handles transition from loading to expired session", async () => {
      // Start in loading state
      mockAuthState = {
        ...mockAuthState,
        isAuthenticated: false,
        isLoading: true,
        isSessionExpired: false,
        user: null,
      };

      const { rerender } = renderGuard();
      expect(screen.getByText("Loading...")).toBeInTheDocument();

      // Session check completes with expired session
      mockAuthState = {
        ...mockAuthState,
        isAuthenticated: false,
        isLoading: false,
        isSessionExpired: true,
        user: null,
      };

      rerender(<AuthGuard><div>Protected Content</div></AuthGuard>);

      // Should show session expired UI
      expect(screen.getByText("Session Expired")).toBeInTheDocument();
      expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  // ── 5. Session Recovery Actions ──────────────────────────────────

  describe("session recovery actions", () => {
    it("redirects to login when Go to Login is clicked", async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      mockPathname.mockReturnValue("/dashboard");
      mockAuthState = {
        ...mockAuthState,
        isAuthenticated: false,
        isLoading: false,
        isSessionExpired: true,
        user: null,
      };

      renderGuard();

      const loginButton = screen.getByText("Go to Login");
      await user.click(loginButton);

      expect(mockPush).toHaveBeenCalledWith("/login?returnTo=%2Fdashboard");
    });
  });

  // ── 6. Fallback Error Handling ──────────────────────────────────

  describe("fallback error handling", () => {
    it("redirects unauthenticated users without rendering protected content", async () => {
      mockAuthState = {
        ...mockAuthState,
        isAuthenticated: false,
        isLoading: false,
        isSessionExpired: false, // Not flagged as expired
        user: null,
      };

      renderGuard();

      await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/login?returnTo=%2Fdashboard"));
      expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
    });
  });

  // ── 7. Consistency Across Entry Points ───────────────────────────

  describe("consistency across entry points", () => {
    const entryPoints = [
      "/dashboard",
      "/dashboard/settings", 
      "/dashboard/confessions",
      "/profile",
      "/admin"
    ];

    entryPoints.forEach(pathname => {
      it(`shows consistent session expired UI for ${pathname}`, () => {
        mockPathname.mockReturnValue(pathname);
        mockAuthState = {
          ...mockAuthState,
          isAuthenticated: false,
          isLoading: false,
          isSessionExpired: true,
          user: null,
        };

        renderGuard();

        expect(screen.getByText("Session Expired")).toBeInTheDocument();
        expect(screen.getByText("Go to Login")).toBeInTheDocument();
        expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
        expect(mockPush).not.toHaveBeenCalled();
      });
    });
  });
});
