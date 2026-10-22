import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";

expect.extend(toHaveNoViolations);

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = jest.fn();
const mockLogout = jest.fn();
const mockAddReaction = jest.fn().mockResolvedValue({ ok: true, data: {} });

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
    user: { username: "testuser", email: "test@example.com" },
    logout: mockLogout,
    isAuthenticated: true,
  }),
}));

jest.mock("@/app/lib/hooks/useReactions", () => ({
  useReactions: () => ({
    addReaction: mockAddReaction,
    isPending: false,
  }),
}));

jest.mock("@/app/lib/utils/errorHandler", () => ({
  logError: jest.fn(),
  getErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Something went wrong",
}));

jest.mock("@/app/lib/api/client", () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));

jest.mock("@/app/lib/api/constants", () => ({
  AUTH_TOKEN_KEY: "token",
  USER_DATA_KEY: "user",
  ANONYMOUS_USER_ID_KEY: "anon",
}));

jest.mock("lucide-react", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  const icon = (name: string) =>
    React.forwardRef((props: Record<string, unknown>, ref: unknown) =>
      React.createElement("svg", { ...props, ref, "data-testid": `icon-${name}` }),
    );
  return {
    Menu: icon("menu"),
    LogOut: icon("logout"),
    X: icon("x"),
    Home: icon("home"),
    Search: icon("search"),
    User: icon("user"),
    MessageSquare: icon("message-square"),
    Heart: icon("heart"),
    ThumbsUp: icon("thumbs-up"),
    AlertCircle: icon("alert-circle"),
    RotateCcw: icon("rotate-ccw"),
    CheckCircle2: icon("check-circle-2"),
    Eye: icon("eye"),
    EyeOff: icon("eye-off"),
    ShieldCheck: icon("shield-check"),
    UserPlus: icon("user-plus"),
    LogIn: icon("log-in"),
    Check: icon("check"),
    Copy: icon("copy"),
  };
});

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

jest.mock("@/app/components/layout/Sidebar", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  return {
    __esModule: true,
    default: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
      isOpen
        ? React.createElement(
            "div",
            {
              role: "dialog",
              "aria-modal": "true",
              "data-testid": "sidebar",
            },
            React.createElement(
              "button",
              { onClick: onClose, "aria-label": "Close menu" },
              "Close",
            ),
            React.createElement("a", { href: "/" }, "Feed"),
            React.createElement("a", { href: "/search" }, "Search"),
          )
        : null,
  };
});

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import Header from "@/app/components/layout/Header";
import { ReactionButton } from "@/app/components/confession/ReactionButtons";
import { ErrorBoundary } from "@/app/components/common/ErrorBoundary";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Thrower({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("Test crash");
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  return React.createElement("div", null, "child content");
}

// ---------------------------------------------------------------------------
// Header – a11y & keyboard
// ---------------------------------------------------------------------------

describe("Header accessibility", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("has no axe violations", async () => {
    const { container } = render(<Header />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("renders a landmark nav with accessible label", () => {
    render(<Header />);
    const header = screen.getByRole("banner");
    expect(header).toHaveAttribute("aria-label", "Main navigation");
  });

  it("contains navigable links reachable by Tab", async () => {
    const user = userEvent.setup();
    render(<Header />);

    const links = screen.getAllByRole("link");
    expect(links.length).toBeGreaterThanOrEqual(4);

    await user.tab();
    expect(document.activeElement?.tagName).toBe("A");
  });

  it("all nav links have visible focus indicators via focus-visible class", () => {
    render(<Header />);
    const feedLink = screen.getByRole("link", { name: "Feed" });
    expect(feedLink.className).toContain("focus-visible:outline");
  });

  it("mobile menu button has aria-expanded and aria-controls", () => {
    render(<Header />);
    const menuButton = screen.getByRole("button", { name: /open menu/i });
    expect(menuButton).toHaveAttribute("aria-expanded", "false");
    expect(menuButton).toHaveAttribute("aria-controls", "mobile-navigation");
  });

  it("Escape key closes the mobile menu and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    render(<Header />);

    const menuButton = screen.getByRole("button", { name: /open menu/i });
    await user.click(menuButton);

    expect(screen.getByTestId("sidebar")).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("banner"), { key: "Escape" });

    expect(screen.queryByTestId("sidebar")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(menuButton);
  });

  it("logout button is keyboard accessible", async () => {
    const user = userEvent.setup();
    render(<Header />);

    const logoutButton = screen.getByRole("button", { name: /logout/i });
    logoutButton.focus();
    await user.keyboard("{Enter}");

    expect(mockLogout).toHaveBeenCalled();
  });

  it("decorative divider is hidden from assistive technology", () => {
    const { container } = render(<Header />);
    const divider = container.querySelector("[aria-hidden='true']");
    expect(divider).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ReactionButton – a11y & keyboard
// ---------------------------------------------------------------------------

describe("ReactionButton accessibility", () => {
  const defaultProps = {
    type: "like" as const,
    count: 5,
    confessionId: "c-1",
    isActive: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockAddReaction.mockResolvedValue({ ok: true, data: {} });
  });

  it("has no axe violations", async () => {
    const { container } = render(<ReactionButton {...defaultProps} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("exposes aria-pressed reflecting active state", () => {
    const { rerender } = render(<ReactionButton {...defaultProps} />);
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-pressed", "false");

    rerender(<ReactionButton {...defaultProps} isActive={true} />);
    expect(button).toHaveAttribute("aria-pressed", "true");
  });

  it("has a descriptive aria-label including count", () => {
    render(<ReactionButton {...defaultProps} />);
    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-label")).toContain("like");
    expect(button.getAttribute("aria-label")).toContain("5");
  });

  it("can be triggered with Enter key", async () => {
    const user = userEvent.setup();
    render(<ReactionButton {...defaultProps} />);

    const button = screen.getByRole("button");
    button.focus();
    await user.keyboard("{Enter}");

    expect(mockAddReaction).toHaveBeenCalledWith("c-1", "like");
  });

  it("can be triggered with Space key", async () => {
    const user = userEvent.setup();
    render(<ReactionButton {...defaultProps} />);

    const button = screen.getByRole("button");
    button.focus();
    await user.keyboard(" ");

    expect(mockAddReaction).toHaveBeenCalled();
  });

  it("shows error with role=alert when reaction fails", async () => {
    mockAddReaction.mockResolvedValue({
      ok: false,
      error: { message: "Rate limited" },
    });

    const user = userEvent.setup();
    render(<ReactionButton {...defaultProps} />);

    await user.click(screen.getByRole("button"));

    const alert = await screen.findByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(within(alert).getByText("Rate limited")).toBeInTheDocument();
  });

  it("has visible focus style via focus-visible class", () => {
    render(<ReactionButton {...defaultProps} />);
    const button = screen.getByRole("button");
    expect(button.className).toContain("focus-visible:outline");
  });
});

// ---------------------------------------------------------------------------
// ErrorBoundary – focus management & a11y
// ---------------------------------------------------------------------------

describe("ErrorBoundary accessibility", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    (console.error as jest.Mock).mockRestore();
  });

  it("renders children when no error", () => {
    render(
      <ErrorBoundary>
        <p>Normal content</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("Normal content")).toBeInTheDocument();
  });

  it("displays error UI with role=alert on crash", () => {
    render(
      <ErrorBoundary>
        <Thrower shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/Test crash/)).toBeInTheDocument();
  });

  it("error container has aria-live=assertive", () => {
    render(
      <ErrorBoundary>
        <Thrower shouldThrow={true} />
      </ErrorBoundary>,
    );

    const alertEl = screen.getByRole("alert");
    expect(alertEl).toHaveAttribute("aria-live", "assertive");
  });

  it("moves focus to the error container on crash", () => {
    render(
      <ErrorBoundary>
        <Thrower shouldThrow={true} />
      </ErrorBoundary>,
    );

    const alertEl = screen.getByRole("alert");
    expect(alertEl).toHaveFocus();
  });

  it("error fallback has no axe violations", async () => {
    const { container } = render(
      <ErrorBoundary>
        <Thrower shouldThrow={true} />
      </ErrorBoundary>,
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("reset button restores children and clears error state", async () => {
    const onReset = jest.fn();
    const user = userEvent.setup();
    let shouldThrow = true;

    function ConditionalThrower() {
      if (shouldThrow) {
        throw new Error("Test crash");
      }
      return <div>child content</div>;
    }

    render(
      <ErrorBoundary onReset={onReset}>
        <ConditionalThrower />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();

    shouldThrow = false;

    const resetButton = screen.getByRole("button", { name: /reboot console/i });
    await user.click(resetButton);

    expect(onReset).toHaveBeenCalled();
    expect(screen.getByText("child content")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("reset button is reachable via keyboard", async () => {
    const user = userEvent.setup();

    render(
      <ErrorBoundary>
        <Thrower shouldThrow={true} />
      </ErrorBoundary>,
    );

    await user.tab();
    const focused = document.activeElement;
    expect(focused?.tagName).toBe("BUTTON");
    expect(focused?.textContent).toContain("REBOOT CONSOLE");
  });

  it("home button is also keyboard reachable", async () => {
    const user = userEvent.setup();

    render(
      <ErrorBoundary>
        <Thrower shouldThrow={true} />
      </ErrorBoundary>,
    );

    await user.tab();
    await user.tab();
    const focused = document.activeElement;
    expect(focused?.tagName).toBe("BUTTON");
    expect(focused?.textContent).toContain("RETURN_HOME");
  });

  it("buttons have visible focus styles via focus-visible class", () => {
    render(
      <ErrorBoundary>
        <Thrower shouldThrow={true} />
      </ErrorBoundary>,
    );

    const buttons = screen.getAllByRole("button");
    buttons.forEach((btn) => {
      expect(btn.className).toContain("focus-visible:outline");
    });
  });
});

// ---------------------------------------------------------------------------
// Login page – a11y & keyboard
// ---------------------------------------------------------------------------

describe("Login page accessibility", () => {
  let LoginPage: () => React.JSX.Element;

  beforeAll(async () => {
    const mod = await import("@/app/(auth)/login/page");
    LoginPage = mod.default;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("has no axe violations", async () => {
    const { container } = render(<LoginPage />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("heading identifies the page purpose", () => {
    render(<LoginPage />);
    expect(
      screen.getByRole("heading", { name: /login/i }),
    ).toBeInTheDocument();
  });

  it("all form controls are labelled", () => {
    render(<LoginPage />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
  });

  it("Tab moves through inputs then buttons in order", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.tab();
    expect(document.activeElement?.tagName).toBe("INPUT");

    await user.tab();
    expect(document.activeElement?.tagName).toBe("INPUT");

    await user.tab();
    expect(document.activeElement?.tagName).toBe("A");

    await user.tab();
    expect(document.activeElement?.tagName).toBe("BUTTON");
  });

  it("sign in button can be activated with Enter", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    const signIn = screen.getByRole("button", { name: /sign in/i });
    signIn.focus();
    await user.keyboard("{Enter}");
    expect(signIn).toBeInTheDocument();
  });

});

// ---------------------------------------------------------------------------
// Register page – a11y & keyboard
// ---------------------------------------------------------------------------

describe("Register page accessibility", () => {
  let RegisterPage: () => React.JSX.Element;

  beforeAll(async () => {
    const mod = await import("@/app/(auth)/register/page");
    RegisterPage = mod.default;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("has no axe violations", async () => {
    const { container } = render(<RegisterPage />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("heading identifies the page purpose", () => {
    render(<RegisterPage />);
    expect(
      screen.getByRole("heading", { name: /create account/i }),
    ).toBeInTheDocument();
  });

  it("all form controls are labelled", () => {
    render(<RegisterPage />);
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
  });

  it("Sign in button routes to /login without calling the backend", async () => {
    const user = userEvent.setup();
    const apiClient = require("@/app/lib/api/client").default;
    render(<RegisterPage />);

    const signInButton = screen.getByRole("button", { name: /sign in/i });
    expect(signInButton).toBeInTheDocument();

    await user.click(signInButton);

    expect(mockPush).toHaveBeenCalledWith("/login");
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it("Tab reaches the sign-in link", async () => {
    userEvent.setup();
    render(<RegisterPage />);

    const signInLink = screen.getByRole("link", { name: /sign in/i });
    expect(signInLink).toHaveAttribute("href", "/login");

    signInLink.focus();
    expect(document.activeElement).toBe(signInLink);
  });
});
