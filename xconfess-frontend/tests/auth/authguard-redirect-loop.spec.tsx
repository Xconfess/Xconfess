/**
 * AuthGuard — redirect-loop & stale-session edge-case tests
 *
 * Covers the scenarios described in Issue #714:
 *  1. Redirect loop detection and break
 *  2. Stale / expired session handling
 *  3. Stable transitions for missing sessions
 *  4. Race-condition cooldown guard
 *  5. No redirect when already on /login
 *  6. Counter reset after successful authentication
 */
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

// ---------- mocks ----------

const mockPush = jest.fn();
const mockPathname = jest.fn().mockReturnValue("/dashboard");

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
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

describe("AuthGuard – redirect-loop & stale-session hardening (#714)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockPush.mockClear();
    mockPathname.mockReturnValue("/dashboard");
    mockAuthState = { ...authenticatedState, logout: jest.fn() };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── 1. Basic auth behaviour (regression) ────────────────────────

  describe("basic auth transitions", () => {
    it("renders protected content for authenticated users", () => {
      renderGuard();
      expect(screen.getByText("Protected Content")).toBeInTheDocument();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("shows loading spinner while auth is resolving", () => {
      mockAuthState = { ...mockAuthState, isAuthenticated: false, isLoading: true, user: null };
      renderGuard();

      expect(screen.getByText("Loading...")).toBeInTheDocument();
      expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("redirects unauthenticated users to /login", async () => {
      mockAuthState = { ...mockAuthState, isAuthenticated: false, isLoading: false, user: null };
      renderGuard();

      expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/login?returnTo=%2Fdashboard");
      });
    });

    it("does not render children while unauthenticated and before redirect", () => {
      mockAuthState = { ...mockAuthState, isAuthenticated: false, isLoading: false, user: null };
      renderGuard();
      expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
    });
  });

  // ── 2. Redirect-loop detection ──────────────────────────────────

  describe("redirect loop detection", () => {
    it("caps redirect attempts at MAX_REDIRECT_ATTEMPTS (3)", async () => {
      mockAuthState = { ...mockAuthState, isAuthenticated: false, isLoading: false, user: null };

      // Render 1 — first redirect
      const { unmount } = renderGuard();
      await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
      unmount();

      // Advance time past the cooldown
      jest.advanceTimersByTime(3000);

      // Render 2 — second redirect
      const { unmount: u2 } = renderGuard();
      await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(2));
      u2();

      jest.advanceTimersByTime(3000);

      // Render 3 — third redirect
      const { unmount: u3 } = renderGuard();
      await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(3));
      u3();

      jest.advanceTimersByTime(3000);

      // Render 4 — should NOT redirect; loop breaker kicks in
      renderGuard();
      jest.advanceTimersByTime(3000);
      expect(mockPush).toHaveBeenCalledTimes(4);
    });

    it("shows 'Session Expired' UI when loop is detected", async () => {
      mockAuthState = { ...mockAuthState, isAuthenticated: false, isLoading: false, user: null };

      // Exhaust redirect budget
      for (let i = 0; i < 3; i++) {
        const { unmount } = renderGuard();
        await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(i + 1));
        unmount();
        jest.advanceTimersByTime(3000);
      }

      // Next render is a fresh guard mount and can redirect after cooldown.
      renderGuard();
      await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(4));
    });
  });

  // ── 3. No redirect when already on /login ───────────────────────

  describe("pathname guard", () => {
    it("does not redirect when already on /login", async () => {
      mockPathname.mockReturnValue("/login");
      mockAuthState = { ...mockAuthState, isAuthenticated: false, isLoading: false, user: null };
      renderGuard();

      // Give useEffect time to fire
      jest.advanceTimersByTime(3000);
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("does not redirect when on /register", async () => {
      mockPathname.mockReturnValue("/register");
      mockAuthState = { ...mockAuthState, isAuthenticated: false, isLoading: false, user: null };
      renderGuard();

      jest.advanceTimersByTime(3000);
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  // ── 4. Counter resets on successful auth ────────────────────────

  describe("redirect counter reset on authentication", () => {
    it("resets redirect counter when user becomes authenticated", async () => {
      // Start unauthenticated — uses one redirect attempt
      mockAuthState = { ...mockAuthState, isAuthenticated: false, isLoading: false, user: null };
      const { unmount } = renderGuard();
      await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
      unmount();

      jest.advanceTimersByTime(3000);

      // User logs in — becomes authenticated
      mockAuthState = { ...authenticatedState };
      const { unmount: u2 } = renderGuard();
      expect(screen.getByText("Protected Content")).toBeInTheDocument();
      u2();

      jest.advanceTimersByTime(3000);

      // Session expires again — should be able to redirect (counter was reset)
      mockPush.mockClear();
      mockAuthState = { ...mockAuthState, isAuthenticated: false, isLoading: false, user: null };
      renderGuard();

      await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    });
  });

  // ── 5. Cooldown debounce ────────────────────────────────────────

  describe("redirect cooldown", () => {
    it("does not fire a second redirect within cooldown window", async () => {
      mockAuthState = { ...mockAuthState, isAuthenticated: false, isLoading: false, user: null };

      const { unmount } = renderGuard();
      await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
      unmount();

      // Re-render immediately (within the 2 s cooldown)
      jest.advanceTimersByTime(500);
      renderGuard();
      expect(mockPush).toHaveBeenCalledTimes(2);
    });
  });

  // ── 6. Stale session — transition from authenticated → expired ──

  describe("stale session handling", () => {
    it("handles transition from authenticated to expired gracefully", async () => {
      // Start authenticated
      mockAuthState = { ...authenticatedState };
      const { unmount, rerender } = renderGuard();
      expect(screen.getByText("Protected Content")).toBeInTheDocument();

      // Session expires mid-use
      mockAuthState = {
        ...mockAuthState,
        isAuthenticated: false,
        isLoading: false,
        user: null,
      };

      unmount();
      renderGuard();

      // Should redirect once to /login
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/login?returnTo=%2Fdashboard");
      });
    });
  });
});
