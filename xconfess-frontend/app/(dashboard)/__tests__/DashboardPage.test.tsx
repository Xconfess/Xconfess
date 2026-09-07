/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

// Set environment variables before imports that might use them
process.env.NEXT_PUBLIC_API_URL = "http://localhost:3000";

import DashboardPage from "../DashboardPage";
import { useAuthContext } from "../../lib/providers/AuthProvider";
import { fetchUserStats } from "@/app/api/user.api";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock dependencies
jest.mock("@/app/lib/config", () => ({
  getApiBaseUrl: () => "http://localhost:3000",
}));

// Mock dependencies
jest.mock("../../lib/providers/AuthProvider");
jest.mock("@/app/api/user.api");
jest.mock("@/app/components/confession/ConfessionFeed", () => ({
  ConfessionFeed: () => <div data-testid="confession-feed" />,
}));
jest.mock("@/app/components/layout/Header", () => () => <header data-testid="header" />);
jest.mock("@/app/components/common/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockUser = {
  id: "user-1",
  username: "testuser",
  email: "test@example.com",
  createdAt: "2024-01-01T00:00:00.000Z",
};

const mockStats = {
  totalConfessions: 10,
  totalReactions: 25,
  mostPopularConfession: "Popular one",
  badges: ["pioneer"],
  streak: 5,
};

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

describe("DashboardPage", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
    (useAuthContext as jest.Mock).mockReturnValue({ user: mockUser });
  });

  it("renders loading skeletons initially", async () => {
    (fetchUserStats as jest.Mock).mockReturnValue(new Promise(() => {}));

    render(
      <QueryClientProvider client={queryClient}>
        <DashboardPage />
      </QueryClientProvider>
    );

    // Check for skeleton elements (we use aria-hidden="true" for skeletons)
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders real API stats when loaded", async () => {
    (fetchUserStats as jest.Mock).mockResolvedValue(mockStats);

    render(
      <QueryClientProvider client={queryClient}>
        <DashboardPage />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("10")).toBeInTheDocument();
      expect(screen.getByText("25")).toBeInTheDocument();
      expect(screen.getByText("5d")).toBeInTheDocument();
    });

    expect(screen.getByText("Confessions")).toBeInTheDocument();
    expect(screen.getByText("Likes received")).toBeInTheDocument();
    expect(screen.getByText("Streak")).toBeInTheDocument();
  });

  it("renders error state when API fails", async () => {
    (fetchUserStats as jest.Mock).mockRejectedValue(new Error("API Error"));

    render(
      <QueryClientProvider client={queryClient}>
        <DashboardPage />
      </QueryClientProvider>
    );

    // Wait for error state. We might need to wait for retries if component has them.
    await waitFor(() => {
      expect(screen.queryByText("Failed to load stats")).toBeInTheDocument();
      expect(screen.queryByText("Retry")).toBeInTheDocument();
    }, { timeout: 4000 });
  });

  it("uses fallback values if stats are missing but API succeeded", async () => {
    (fetchUserStats as jest.Mock).mockResolvedValue({
      totalConfessions: 0,
      totalReactions: 0,
      streak: 0,
    });

    render(
      <QueryClientProvider client={queryClient}>
        <DashboardPage />
      </QueryClientProvider>
    );

    await waitFor(() => {
      const zeros = screen.getAllByText("0");
      expect(zeros.length).toBe(2); // Confessions and Likes received
      expect(screen.getByText("0d")).toBeInTheDocument();
    });
  });
});
