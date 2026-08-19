import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockPush = jest.fn();
const mockPathname = jest.fn().mockReturnValue("/");

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockPathname(),
}));

let mockAuthState = {
  isAuthenticated: false,
  isLoading: false,
  isSessionExpired: true,
  user: null,
  login: jest.fn(),
  logout: jest.fn(),
  register: jest.fn(),
  checkAuth: jest.fn(),
  error: null,
};

jest.mock("@/app/lib/hooks/useAuth", () => ({
  useAuth: () => mockAuthState,
}));

import { AuthGuard } from "@/app/components/AuthGuard";
import { SessionExpiredBanner } from "@/app/components/SessionExpiredBanner";

function ProtectedContent() {
  return <div>Protected Content</div>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthState = {
    isAuthenticated: false,
    isLoading: false,
    isSessionExpired: true,
    user: null,
    login: jest.fn(),
    logout: jest.fn(),
    register: jest.fn(),
    checkAuth: jest.fn(),
    error: null,
  };
});

describe("SessionExpiredBanner", () => {
  it("renders banner variant with login button", () => {
    mockPathname.mockReturnValue("/dashboard");
    render(<SessionExpiredBanner variant="banner" />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/session has expired/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /log in/i })).toBeInTheDocument();
  });

  it("renders fullscreen variant with login button", () => {
    mockPathname.mockReturnValue("/profile");
    render(<SessionExpiredBanner variant="fullscreen" />);
    expect(screen.getByText(/session expired/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /go to login/i })).toBeInTheDocument();
  });

  it("preserves return destination on login click from dashboard", async () => {
    mockPathname.mockReturnValue("/dashboard");
    render(<SessionExpiredBanner variant="banner" />);
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));
    expect(mockPush).toHaveBeenCalledWith("/login?returnTo=%2Fdashboard");
  });

  it("preserves return destination on login click from profile", async () => {
    mockPathname.mockReturnValue("/profile");
    render(<SessionExpiredBanner variant="fullscreen" />);
    await userEvent.click(screen.getByRole("button", { name: /go to login/i }));
    expect(mockPush).toHaveBeenCalledWith("/login?returnTo=%2Fprofile");
  });

  it("preserves return destination on login click from admin", async () => {
    mockPathname.mockReturnValue("/admin/dashboard");
    render(<SessionExpiredBanner variant="banner" />);
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));
    expect(mockPush).toHaveBeenCalledWith("/login?returnTo=%2Fadmin%2Fdashboard");
  });
});

describe("AuthGuard with expired session", () => {
  it("shows consistent session expired UI on dashboard route", () => {
    mockPathname.mockReturnValue("/dashboard");
    render(
      <AuthGuard>
        <ProtectedContent />
      </AuthGuard>
    );
    expect(screen.getByText(/session expired/i)).toBeInTheDocument();
    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
  });

  it("shows consistent session expired UI on admin route", () => {
    mockPathname.mockReturnValue("/admin/dashboard");
    render(
      <AuthGuard>
        <ProtectedContent />
      </AuthGuard>
    );
    expect(screen.getByText(/session expired/i)).toBeInTheDocument();
    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
  });

  it("shows consistent session expired UI on profile route", () => {
    mockPathname.mockReturnValue("/profile");
    render(
      <AuthGuard>
        <ProtectedContent />
      </AuthGuard>
    );
    expect(screen.getByText(/session expired/i)).toBeInTheDocument();
    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
  });

  it("does not show expired UI when authenticated", () => {
    mockAuthState = {
      ...mockAuthState,
      isAuthenticated: true,
      isSessionExpired: false,
      user: { username: "test", email: "t@t.com", role: "user" } as any,
    };
    mockPathname.mockReturnValue("/dashboard");
    render(
      <AuthGuard>
        <ProtectedContent />
      </AuthGuard>
    );
    expect(screen.queryByText(/session expired/i)).not.toBeInTheDocument();
    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });
});
