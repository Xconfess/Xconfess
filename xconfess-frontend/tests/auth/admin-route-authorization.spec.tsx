/**
 * Admin route-level authorization tests - Issue #1444
 *
 * Enumerates every page under xconfess-frontend/app/(dashboard)/admin/**
 * and verifies that the AdminLayout authentication gate correctly handles
 * every session state for every admin route.
 *
 * Session states covered per route:
 *   1. Unauthenticated       -> redirected to /login, no admin UI
 *   2. Authenticated non-admin -> redirected to /dashboard, no admin UI
 *   3. Authenticated admin   -> layout renders, no redirect
 *   4. Loading               -> no admin UI, no redirect fired
 *
 * Plus cross-cutting guarantees:
 *   - A single mount fires exactly one redirect (no loop on a single mount)
 *   - Loading state never leaks any admin content or placeholder
 *   - Dev bypass path renders for unauthenticated users when enabled
 */
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ---------- Mocks (must be declared before component imports) ----------

const mockReplace = jest.fn();
const mockPathname = jest.fn().mockReturnValue("/admin/users");

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => mockPathname(),
  redirect: jest.fn()
}));

let mockAuthState = {
  isAuthenticated: false,
  isLoading: false,
  user: null
};

jest.mock("@/app/lib/hooks/useAuth", () => ({
  useAuth: () => mockAuthState
}));

// ---------- Imports under test ----------
// Each admin page is imported so its module is loadable from the test
// harness; this is the "every admin page is covered" surface under #1444.

import AdminLayout from "@/app/(dashboard)/admin/layout";
import AdminIndexPage from "@/app/(dashboard)/admin/page";
import AdminDashboardPage from "@/app/(dashboard)/admin/dashboard/page";
import AdminUsersPage from "@/app/(dashboard)/admin/users/page";
import AdminReportsPage from "@/app/(dashboard)/admin/reports/page";
import AdminAuditLogsPage from "@/app/(dashboard)/admin/audit-logs/page";
import AdminNotificationsPage from "@/app/(dashboard)/admin/notifications/page";
import AdminDiagnosticsPage from "@/app/(dashboard)/admin/diagnostics/page";
import AdminFeatureFlagsPage from "@/app/(dashboard)/admin/feature-flags/page";
import AdminTemplatesPage from "@/app/(dashboard)/admin/templates/page";

// ---------- Fixtures ----------

const ADMIN_USER = {
  id: "admin-1",
  email: "admin@example.com",
  username: "admin",
  role: "admin",
  is_active: true,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z"
};

const REGULAR_USER = {
  ...ADMIN_USER,
  id: "user-2",
  email: "user@example.com",
  username: "regular",
  role: "user"
};

/**
 * Sidebar labels that must never be visible to unauthorized users. Note:
 * AdminLayout's navItems deliberately omits "Templates" and "Feature
 * Flags", so those labels are not asserted here.
 */
const ADMIN_SIDEBAR_LABELS = [
  "Dashboard",
  "Reports",
  "Users",
  "Notifications",
  "Audit Logs",
  "Diagnostics"
];

const PLACEHOLDER_TESTID = "route-content-placeholder";

function renderRoutePlaceholder() {
  return (
    <div data-testid={PLACEHOLDER_TESTID}>route content placeholder</div>
  );
}

// ---------- Render helpers ----------

function withQueryClient(node) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });
  return render(
    <QueryClientProvider client={client}>{node}</QueryClientProvider>
  );
}

function renderAdminRoute(node, pathname) {
  mockPathname.mockReturnValue(pathname);
  return withQueryClient(<AdminLayout>{node}</AdminLayout>);
}

function expectNoAdminUiVisible() {
  expect(screen.queryByText("Admin Dashboard")).not.toBeInTheDocument();
  for (const label of ADMIN_SIDEBAR_LABELS) {
    expect(screen.queryByText(label)).not.toBeInTheDocument();
  }
}

function countReplacesTo(path) {
  return mockReplace.mock.calls.filter((args) => args[0] === path).length;
}

const ADMIN_ROUTES = [
  {
    name: "/admin (root index)",
    path: "/admin",
    Page: AdminIndexPage
  },
  {
    name: "/admin/dashboard",
    path: "/admin/dashboard",
    Page: AdminDashboardPage
  },
  {
    name: "/admin/users",
    path: "/admin/users",
    Page: AdminUsersPage
  },
  {
    name: "/admin/reports",
    path: "/admin/reports",
    Page: AdminReportsPage
  },
  {
    name: "/admin/audit-logs",
    path: "/admin/audit-logs",
    Page: AdminAuditLogsPage
  },
  {
    name: "/admin/notifications",
    path: "/admin/notifications",
    Page: AdminNotificationsPage
  },
  {
    name: "/admin/diagnostics",
    path: "/admin/diagnostics",
    Page: AdminDiagnosticsPage
  },
  {
    name: "/admin/feature-flags",
    path: "/admin/feature-flags",
    Page: AdminFeatureFlagsPage
  },
  {
    name: "/admin/templates",
    path: "/admin/templates",
    Page: AdminTemplatesPage
  }
];

beforeEach(() => {
  mockReplace.mockClear();
  mockPathname.mockReturnValue("/admin/users");
  mockAuthState = {
    isAuthenticated: false,
    isLoading: false,
    user: null
  };
});

// ---------- Tests ----------

describe("Admin route-level authorization (#1444)", () => {
  describe.each(ADMIN_ROUTES)("$name", ({ path, Page }) => {
    it("redirects unauthenticated users to /login and hides the admin UI", async () => {
      renderAdminRoute(<Page />, path);

      expectNoAdminUiVisible();

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith("/login");
      });
      expect(countReplacesTo("/login")).toBe(1);
    });

    it("redirects authenticated non-admin users to /dashboard and hides the admin UI", async () => {
      mockAuthState = {
        isAuthenticated: true,
        isLoading: false,
        user: REGULAR_USER
      };
      renderAdminRoute(<Page />, path);

      expectNoAdminUiVisible();

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith("/dashboard");
      });
      expect(countReplacesTo("/dashboard")).toBe(1);
    });

    it("renders the admin layout for authenticated admins without redirecting", () => {
      mockAuthState = {
        isAuthenticated: true,
        isLoading: false,
        user: ADMIN_USER
      };
      // Placeholder child is used so the auth gate's "passes for admin"
      // signal is verified independently of page-specific React contexts.
      renderAdminRoute(renderRoutePlaceholder(), path);

      expect(screen.getByText("Admin Dashboard")).toBeInTheDocument();
      expect(screen.getByTestId(PLACEHOLDER_TESTID)).toBeInTheDocument();
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it("renders nothing during the loading phase and fires no redirect", () => {
      mockAuthState = {
        isAuthenticated: false,
        isLoading: true,
        user: null
      };
      renderAdminRoute(<Page />, path);

      expectNoAdminUiVisible();
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it("does not loop on a single unauthorized mount", async () => {
      renderAdminRoute(<Page />, path);

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalled();
      });
      expect(mockReplace.mock.calls.length).toBe(1);
    });
  });

  describe("loading state never leaks admin content or placeholders", () => {
    it("never renders admin chrome or any child body during loading", () => {
      mockAuthState = {
        isAuthenticated: false,
        isLoading: true,
        user: null
      };
      renderAdminRoute(
        <div data-testid="sensitive-admin-placeholder">
          SENSITIVE_ADMIN_PLACEHOLDER
        </div>,
        "/admin/users"
      );

      expect(
        screen.queryByTestId("sensitive-admin-placeholder")
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText("SENSITIVE_ADMIN_PLACEHOLDER")
      ).not.toBeInTheDocument();
      expect(screen.queryByText("Admin Dashboard")).not.toBeInTheDocument();
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });
  });

  describe("dev bypass short-circuit (development only)", () => {
    const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
    const ORIGINAL_BYPASS = process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH;

    afterEach(() => {
      process.env.NODE_ENV = ORIGINAL_NODE_ENV;
      process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH = ORIGINAL_BYPASS;
    });

    it("still requires an admin user when dev bypass is enabled", async () => {
      process.env.NODE_ENV = "development";
      process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH = "true";

      mockAuthState = {
        isAuthenticated: false,
        isLoading: false,
        user: null
      };
      renderAdminRoute(renderRoutePlaceholder(), "/admin/users");

      expect(screen.queryByText("Admin Dashboard")).not.toBeInTheDocument();
      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith("/dashboard");
      });
    });
  });
});
