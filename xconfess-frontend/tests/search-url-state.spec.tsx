import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SearchPage from "@/app/(dashboard)/search/page";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSearchParamsValue = "q=test&sort=oldest&minReactions=5";
let currentSearchParams = new URLSearchParams(mockSearchParamsValue);
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  usePathname: () => "/search",
  useSearchParams: () => currentSearchParams,
}));

jest.mock("@/app/lib/hooks/useSearch", () => ({
  useSearch: () => ({
    results: [],
    total: 0,
    hasMore: false,
    page: 1,
    isLoading: false,
    isRetrying: false,
    error: null,
    statusMeta: null,
    loadMore: jest.fn(),
    reset: jest.fn(),
    retry: jest.fn(),
  }),
}));

jest.mock("@/app/lib/hooks/useAuth", () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    isSessionExpired: false,
    user: { username: "tester", email: "tester@example.com", role: "user" },
  }),
}));

// Mock focus trap to avoid issues in testing environment
jest.mock("@/app/lib/hooks/useFocusTrap", () => ({
  useFocusTrap: jest.fn(),
}));

jest.mock("@/app/components/search/SearchResults", () => ({
  SearchResults: () => <div data-testid="search-results">Search Results</div>,
}));

// Mock lucide icons to prevent memory issues or SVG complexity in tests
jest.mock("lucide-react", () => ({
  Filter: () => <div data-testid="filter-icon" />,
  X: () => <div data-testid="x-icon" />,
  Search: () => <div data-testid="search-icon" />,
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Search Page URL State", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    currentSearchParams = new URLSearchParams("");
  });

  it("hydrates search state from URL on initial load", () => {
    currentSearchParams = new URLSearchParams("q=hello&sort=oldest&minReactions=10");
    render(<SearchPage />);
    
    // Check if the search input was populated
    const searchInput = screen.getByRole("combobox", { name: /search confessions/i });
    expect(searchInput).toHaveValue("hello");
    
    // Check if filter chips are rendered for the applied filters
    expect(screen.getByText("Oldest")).toBeInTheDocument();
    expect(screen.getByText("Min 10 reactions")).toBeInTheDocument();
  });

  it("updates URL using router.push when removing a filter", async () => {
    currentSearchParams = new URLSearchParams("q=hello&sort=oldest&minReactions=10");
    render(<SearchPage />);
    
    const user = userEvent.setup();
    
    const clearAllBtn = screen.getByRole("button", { name: /clear all/i });
    
    await act(async () => {
      await user.click(clearAllBtn);
    });

    // It should call router.push with empty URL search params (or default sort)
    // The exact param is just pathname since it drops q and minReactions, and sort="newest"
    expect(mockPush).toHaveBeenCalledWith("/search", { scroll: false });
  });

  it("updates URL using router.push when submitting search query", async () => {
    currentSearchParams = new URLSearchParams("");
    render(<SearchPage />);
    
    const user = userEvent.setup();
    const searchInput = screen.getByRole("combobox", { name: /search confessions/i });
    
    await act(async () => {
      await user.type(searchInput, "new query{enter}");
    });
    
    expect(mockPush).toHaveBeenCalledWith("?q=new+query", { scroll: false });
  });
});
