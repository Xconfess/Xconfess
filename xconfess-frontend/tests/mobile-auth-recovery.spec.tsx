import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

const mockPush = jest.fn();

type MockAuthState = {
  isAuthenticated: boolean;
  isLoading: boolean;
  isSessionExpired: boolean;
  user: { username: string; email: string; role: string } | null;
  logout: jest.Mock;
};

const defaultAuthState: MockAuthState = {
  isAuthenticated: true,
  isLoading: false,
  isSessionExpired: false,
  user: { username: "testuser", email: "test@example.com", role: "user" },
  logout: jest.fn(),
};

let mockAuthState: MockAuthState = defaultAuthState;

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/dashboard",
}));

jest.mock("@/app/lib/hooks/useAuth", () => ({
  useAuth: () => mockAuthState,
}));

import { AuthGuard } from "@/app/components/AuthGuard";

describe("Mobile Auth Recovery Regression Coverage", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockAuthState = {
      ...defaultAuthState,
      logout: jest.fn(),
    };
  });

  function renderGuard(children: ReactNode = <div>Protected Content</div>) {
    return render(<AuthGuard>{children}</AuthGuard>);
  }

  it("shows loading state without redirecting while auth is unresolved", () => {
    mockAuthState = {
      ...mockAuthState,
      isAuthenticated: false,
      isLoading: true,
      user: null,
    };

    renderGuard();

    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("redirects unauthenticated users to login and suppresses protected content", async () => {
    mockAuthState = {
      ...mockAuthState,
      isAuthenticated: false,
      isLoading: false,
      user: null,
    };

    renderGuard();

    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/login?returnTo=%2Fdashboard");
    });
  });

  it("renders protected content for authenticated users without redirecting", () => {
    renderGuard();

    expect(screen.getByText("Protected Content")).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
