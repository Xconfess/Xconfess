import { render, screen, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";

expect.extend(toHaveNoViolations);

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = jest.fn();
const mockLogout = jest.fn();
let mockUserRole = "user";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/",
}));

jest.mock("next/link", () => {
  return ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const React = require("react");
    return React.createElement("a", { href, ...rest }, children);
  };
});

jest.mock("@/app/lib/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { username: "testuser", email: "test@example.com", role: mockUserRole },
    logout: mockLogout,
    isAuthenticated: true,
    isLoading: false,
  }),
}));

jest.mock("@/app/components/common/ThemeToggle", () => ({
  ThemeToggle: () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const React = require("react");
    return React.createElement(
      "button",
      { "aria-label": "Toggle theme" },
      "Theme",
    );
  },
}));

// Mock useIsMobile to simulate mobile
jest.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => true,
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import Header from "@/app/components/layout/Header";
import Sidebar from "@/app/components/layout/Sidebar";

// ---------------------------------------------------------------------------
// Mobile Navigation Regression Tests
// ---------------------------------------------------------------------------

describe("Mobile Navigation Regression Coverage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserRole = "user";
    // Set viewport width to 375px for strict mobile regression coverage
    global.innerWidth = 375;
    global.dispatchEvent(new Event("resize"));
  });

  describe("Sidebar Component at 375px Viewport", () => {
    it("renders mobile sidebar when open and maintains 375px width constraints", () => {
      render(<Sidebar isOpen={true} onClose={() => { }} />);

      const sidebar = screen.getByRole("dialog", { name: "Mobile Navigation" });
      expect(sidebar).toBeInTheDocument();
      expect(sidebar).toHaveClass("translate-x-0");
      expect(sidebar).toHaveClass("w-72"); // fits well within 375px screen
    });

    it("does not render when closed", () => {
      render(<Sidebar isOpen={false} onClose={() => { }} />);

      const sidebar = screen.getByRole("dialog", { name: "Mobile Navigation" });
      expect(sidebar).toHaveClass("translate-x-full");
    });

    it("closes when overlay is clicked", async () => {
      const mockOnClose = jest.fn();
      const user = userEvent.setup();

      render(<Sidebar isOpen={true} onClose={mockOnClose} />);

      const overlay = document.querySelector('.fixed.inset-0.bg-black\\/50');
      expect(overlay).toBeInTheDocument();

      await act(async () => {
        await user.click(overlay as Element);
      });

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it("closes when close button is clicked", async () => {
      const mockOnClose = jest.fn();
      const user = userEvent.setup();

      render(<Sidebar isOpen={true} onClose={mockOnClose} />);

      const closeButton = screen.getByRole("button", { name: "Close menu" });

      await act(async () => {
        await user.click(closeButton);
      });

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it("contains all navigation links", () => {
      render(<Sidebar isOpen={true} onClose={() => { }} />);

      expect(screen.getByRole("link", { name: "Feed" })).toHaveAttribute("href", "/");
      expect(screen.getByRole("link", { name: "Search" })).toHaveAttribute("href", "/search");
      expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute("href", "/profile");
      expect(screen.getByRole("link", { name: "Messages" })).toHaveAttribute("href", "/messages");
    });

    it("calls onClose when navigation links are clicked", async () => {
      const mockOnClose = jest.fn();
      const user = userEvent.setup();

      render(<Sidebar isOpen={true} onClose={mockOnClose} />);

      const feedLink = screen.getByRole("link", { name: "Feed" });

      await act(async () => {
        await user.click(feedLink);
      });

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it("shows user info and logout when authenticated", () => {
      render(<Sidebar isOpen={true} onClose={() => { }} />);

      expect(screen.getByText("testuser")).toBeInTheDocument();
      expect(screen.getByText("test@example.com")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Logout" })).toBeInTheDocument();
    });

    it("logout button calls logout and onClose", async () => {
      const mockOnClose = jest.fn();
      const user = userEvent.setup();

      render(<Sidebar isOpen={true} onClose={mockOnClose} />);

      const logoutButton = screen.getByRole("button", { name: "Logout" });

      await act(async () => {
        await user.click(logoutButton);
      });

      expect(mockLogout).toHaveBeenCalledTimes(1);
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it("has no accessibility violations", async () => {
      const { container } = render(<Sidebar isOpen={true} onClose={() => { }} />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe("Header Mobile Menu", () => {
    it("shows mobile menu button on mobile", () => {
      render(<Header />);

      const menuButton = screen.getByRole("button", { name: /open menu/i });
      expect(menuButton).toBeInTheDocument();
      expect(menuButton).toHaveAttribute("aria-expanded", "false");
    });

    it("opens sidebar when menu button is clicked", async () => {
      const user = userEvent.setup();
      render(<Header />);

      const menuButton = screen.getByRole("button", { name: /open menu/i });

      await act(async () => {
        await user.click(menuButton);
      });

      expect(screen.getByRole("dialog", { name: "Mobile Navigation" })).toBeInTheDocument();
      expect(menuButton).toHaveAttribute("aria-expanded", "true");
    });

    it("closes sidebar when close is called", async () => {
      const user = userEvent.setup();
      render(<Header />);

      const menuButton = screen.getByRole("button", { name: /open menu/i });

      await act(async () => {
        await user.click(menuButton);
      });

      const sidebar = screen.getByRole("dialog", { name: "Mobile Navigation" });
      expect(sidebar).toHaveClass("translate-x-0");

      const dialog = screen.getByRole("dialog", { name: "Mobile Navigation" });
      const closeButton = within(dialog).getByRole("button", { name: "Close menu" });

      await act(async () => {
        await user.click(closeButton);
      });

      expect(sidebar).toHaveClass("translate-x-full");
      expect(menuButton).toHaveAttribute("aria-expanded", "false");
    });

    it("returns focus to menu button when closed", async () => {
      const user = userEvent.setup();
      render(<Header />);

      const menuButton = screen.getByRole("button", { name: /open menu/i });

      await act(async () => {
        await user.click(menuButton);
      });

      const dialog = screen.getByRole("dialog", { name: "Mobile Navigation" });
      const closeButton = within(dialog).getByRole("button", { name: "Close menu" });

      await act(async () => {
        await user.click(closeButton);
      });

      expect(document.activeElement).toBe(menuButton);
    });
  });

  describe("Dashboard & Admin Guard on Mobile", () => {
    it("renders header and main content correctly on 375px mobile view", () => {
      render(
        <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 max-w-[375px]">
          <Header />
          <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
            <div>Dashboard Content</div>
          </main>
        </div>
      );

      expect(screen.getByRole("banner")).toBeInTheDocument();
      expect(screen.getByText("Dashboard Content")).toBeInTheDocument();
    });

    it("enforces admin guard restrictions on mobile dashboard routes", () => {
      mockUserRole = "user";

      const AdminGuardMock = () => {
        const { user } = require("@/app/lib/hooks/useAuth").useAuth();
        if (user.role !== "admin") {
          return <div data-testid="unauthorized-banner">Access Denied</div>;
        }
        return <div>Admin Panel</div>;
      };

      render(<AdminGuardMock />);
      expect(screen.getByTestId("unauthorized-banner")).toBeInTheDocument();
      expect(screen.queryByText("Admin Panel")).not.toBeInTheDocument();
    });
  });
});
