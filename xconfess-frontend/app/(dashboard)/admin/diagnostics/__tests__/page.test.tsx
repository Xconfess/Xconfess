/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DiagnosticsPage from "../page";
import { adminApi } from "@/app/lib/api/admin";
import { fetchStellarDiagnostics } from "@/app/lib/api/stellar";

jest.mock("@/app/lib/api/admin", () => ({
  adminApi: {
    getObservability: jest.fn(),
  },
}));

jest.mock("@/app/lib/api/stellar", () => ({
  fetchStellarDiagnostics: jest.fn(),
}));

const mockDiagnostics = {
  network: "testnet",
  horizonUrl: "https://horizon-testnet.stellar.org",
  sorobanRpcUrl: "https://soroban-rpc-testnet.stellar.org",
  contractIds: {
    confessionAnchor: "CABC123",
    reputationBadges: "CDEF456",
    tippingSystem: "CGHI789",
  },
  horizonStatus: "ok" as const,
  horizonLatencyMs: 142,
  deploymentMetadata: {
    loaded: true,
    generatedAtUtc: "2026-05-21T12:34:56Z",
    isStale: false,
    ageDays: 7,
    loadError: null,
  },
  checkedAt: "2026-06-20T10:00:00.000Z",
};

const mockObservability = {
  audit: {
    totalLogs: 42,
    actionTypeCounts: [{ actionType: "REPORT_RESOLVED", count: 18 }],
  },
  notifications: {
    main: { active: 2, waiting: 1, failed: 0 },
    dlq: { failed: 0, waiting: 0, delayed: 0 },
  },
  generatedAt: "2026-06-20T10:00:00.000Z",
};

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe("DiagnosticsPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the page heading", () => {
    (fetchStellarDiagnostics as jest.Mock).mockResolvedValue(mockDiagnostics);
    (adminApi.getObservability as jest.Mock).mockResolvedValue(
      mockObservability,
    );

    renderWithProviders(<DiagnosticsPage />);
    expect(screen.getByText("System Diagnostics")).toBeInTheDocument();
  });

  it("shows network, contract IDs, and Horizon status on success", async () => {
    (fetchStellarDiagnostics as jest.Mock).mockResolvedValue(mockDiagnostics);
    (adminApi.getObservability as jest.Mock).mockResolvedValue(
      mockObservability,
    );

    renderWithProviders(<DiagnosticsPage />);

    await waitFor(() => {
      expect(screen.getByText("testnet")).toBeInTheDocument();
      expect(screen.getByText("CABC123")).toBeInTheDocument();
      expect(screen.getByText("Reachable")).toBeInTheDocument();
      expect(screen.getByText("142 ms")).toBeInTheDocument();
    });
  });

  it("shows degraded warning when Horizon status is degraded", async () => {
    (fetchStellarDiagnostics as jest.Mock).mockResolvedValue({
      ...mockDiagnostics,
      horizonStatus: "degraded",
      horizonLatencyMs: 3200,
    });
    (adminApi.getObservability as jest.Mock).mockResolvedValue(
      mockObservability,
    );

    renderWithProviders(<DiagnosticsPage />);

    await waitFor(() => {
      expect(screen.getByText("Degraded")).toBeInTheDocument();
      expect(
        screen.getByText(/Horizon returned a non-success response/),
      ).toBeInTheDocument();
    });
  });

  it("shows unreachable warning when Horizon is unreachable", async () => {
    (fetchStellarDiagnostics as jest.Mock).mockResolvedValue({
      ...mockDiagnostics,
      horizonStatus: "unreachable",
      horizonLatencyMs: null,
    });
    (adminApi.getObservability as jest.Mock).mockResolvedValue(
      mockObservability,
    );

    renderWithProviders(<DiagnosticsPage />);

    await waitFor(() => {
      expect(screen.getByText("Unreachable")).toBeInTheDocument();
      expect(screen.getByText(/Horizon is unreachable/)).toBeInTheDocument();
    });
  });

  it("shows error banner when diagnostics fetch fails", async () => {
    (fetchStellarDiagnostics as jest.Mock).mockRejectedValue(
      new Error("network error"),
    );
    (adminApi.getObservability as jest.Mock).mockResolvedValue(
      mockObservability,
    );

    renderWithProviders(<DiagnosticsPage />);

    await waitFor(() => {
      expect(
        screen.getByText("Failed to load Stellar diagnostics."),
      ).toBeInTheDocument();
    });
  });

  it("shows observability metrics and error state when observability fails", async () => {
    (fetchStellarDiagnostics as jest.Mock).mockResolvedValue(mockDiagnostics);
    (adminApi.getObservability as jest.Mock).mockRejectedValue(
      new Error("API failure"),
    );

    renderWithProviders(<DiagnosticsPage />);

    await waitFor(() => {
      expect(
        screen.getByText(
          "Failed to load queue metrics.",
        ),
      ).toBeInTheDocument();
    });
  });

  it("renders observability metrics on success", async () => {
    (fetchStellarDiagnostics as jest.Mock).mockResolvedValue(mockDiagnostics);
    (adminApi.getObservability as jest.Mock).mockResolvedValue(
      mockObservability,
    );

    renderWithProviders(<DiagnosticsPage />);

    await waitFor(() => {
      expect(screen.getByText("Audit Activity")).toBeInTheDocument();
      expect(screen.getByText("42")).toBeInTheDocument();
      expect(screen.getByText("REPORT_RESOLVED")).toBeInTheDocument();
    });
  });
});
