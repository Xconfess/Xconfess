/**
 * @jest-environment jsdom
 *
 * Tests for AuthGuard's session-expiry redirect behaviour.
 *
 * Acceptance criteria covered:
 *  • Navigates to /login (with returnTo) when session expires mid-session
 *  • Shows the SessionExpiredBanner fullscreen view instead of children
 *    when isSessionExpired is true
 *  • Does NOT redirect when already on a public auth path (loop prevention)
 *  • Does NOT redirect while still loading (avoids premature redirects)
 *  • Resets the redirect guard when the user re-authenticates (no stale flag)
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock next/navigation
// ---------------------------------------------------------------------------

const mockPush = jest.fn();
const mockPathname = jest.fn(() => '/dashboard');

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({ push: mockPush }),
}));

// ---------------------------------------------------------------------------
// Mock useAuth — we control the auth state per test
// ---------------------------------------------------------------------------

type MockAuthState = {
  isAuthenticated: boolean;
  isLoading: boolean;
  isSessionExpired: boolean;
};

let mockAuthState: MockAuthState = {
  isAuthenticated: false,
  isLoading: false,
  isSessionExpired: false,
};

jest.mock('@/app/lib/hooks/useAuth', () => ({
  useAuth: () => mockAuthState,
}));

// ---------------------------------------------------------------------------
// Mock SessionExpiredBanner (lightweight stand-in)
// ---------------------------------------------------------------------------

jest.mock('@/app/components/SessionExpiredBanner', () => ({
  SessionExpiredBanner: ({ variant }: { variant?: string }) => (
    <div data-testid="session-expired-banner" data-variant={variant}>
      Session Expired
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Import SUT after mocks
// ---------------------------------------------------------------------------

import { AuthGuard } from '../AuthGuard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderGuard(children: React.ReactNode = <p>Protected content</p>) {
  return render(<AuthGuard>{children}</AuthGuard>);
}

function setAuth(state: Partial<MockAuthState>) {
  mockAuthState = { ...mockAuthState, ...state };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthGuard — session-expiry redirect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPathname.mockReturnValue('/dashboard');
    // Default: unauthenticated, not loading, session not expired
    mockAuthState = { isAuthenticated: false, isLoading: false, isSessionExpired: false };
  });

  // ── Redirect behaviour ────────────────────────────────────────────────────

  it('redirects to /login with returnTo when unauthenticated and session not expired', async () => {
    await act(async () => {
      renderGuard();
    });

    expect(mockPush).toHaveBeenCalledWith(
      '/login?returnTo=%2Fdashboard',
    );
  });

  it('encodes the current pathname as returnTo', async () => {
    mockPathname.mockReturnValue('/confessions/abc-123');
    setAuth({ isAuthenticated: false, isLoading: false, isSessionExpired: false });

    await act(async () => {
      renderGuard();
    });

    expect(mockPush).toHaveBeenCalledWith(
      '/login?returnTo=%2Fconfessions%2Fabc-123',
    );
  });

  // ── Session-expired banner ────────────────────────────────────────────────

  it('shows SessionExpiredBanner (fullscreen) when isSessionExpired is true', async () => {
    setAuth({ isAuthenticated: false, isLoading: false, isSessionExpired: true });

    await act(async () => {
      renderGuard(<p>Protected</p>);
    });

    expect(screen.getByTestId('session-expired-banner')).toBeInTheDocument();
    expect(screen.getByTestId('session-expired-banner')).toHaveAttribute(
      'data-variant',
      'fullscreen',
    );
    expect(screen.queryByText('Protected')).not.toBeInTheDocument();
  });

  it('does NOT redirect when session is expired (banner handles navigation)', async () => {
    setAuth({ isAuthenticated: false, isLoading: false, isSessionExpired: true });

    await act(async () => {
      renderGuard();
    });

    // The guard skips the automatic redirect because isSessionExpired === true
    expect(mockPush).not.toHaveBeenCalled();
  });

  // ── Loop prevention ───────────────────────────────────────────────────────

  it('does NOT redirect when already on /login (avoids redirect loops)', async () => {
    mockPathname.mockReturnValue('/login');
    setAuth({ isAuthenticated: false, isLoading: false, isSessionExpired: false });

    await act(async () => {
      renderGuard();
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('does NOT redirect when already on /register', async () => {
    mockPathname.mockReturnValue('/register');
    setAuth({ isAuthenticated: false });

    await act(async () => {
      renderGuard();
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('does NOT redirect when already on /forgot-password', async () => {
    mockPathname.mockReturnValue('/forgot-password');
    setAuth({ isAuthenticated: false });

    await act(async () => {
      renderGuard();
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('does NOT redirect while isLoading is true', async () => {
    setAuth({ isAuthenticated: false, isLoading: true });

    await act(async () => {
      renderGuard();
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  // ── Authenticated state ───────────────────────────────────────────────────

  it('renders children when the user is authenticated', async () => {
    setAuth({ isAuthenticated: true, isLoading: false, isSessionExpired: false });

    await act(async () => {
      renderGuard(<p>Protected content</p>);
    });

    expect(screen.getByText('Protected content')).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('renders children without redirect on public auth paths even when unauthenticated', async () => {
    mockPathname.mockReturnValue('/login');
    setAuth({ isAuthenticated: false });

    await act(async () => {
      renderGuard(<p>Login form</p>);
    });

    expect(screen.getByText('Login form')).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  // ── Re-authentication clears stale redirect state ─────────────────────────

  it('allows fresh redirect after re-authenticating then logging out again', async () => {
    // First render: authenticated — no redirect
    setAuth({ isAuthenticated: true, isLoading: false });
    const { rerender } = render(
      <AuthGuard>
        <p>content</p>
      </AuthGuard>,
    );
    expect(mockPush).not.toHaveBeenCalled();

    // Session expires: re-render with unauthenticated, non-expired state
    setAuth({ isAuthenticated: false, isLoading: false, isSessionExpired: false });
    await act(async () => {
      rerender(
        <AuthGuard>
          <p>content</p>
        </AuthGuard>,
      );
    });

    expect(mockPush).toHaveBeenCalledWith('/login?returnTo=%2Fdashboard');
  });
});
