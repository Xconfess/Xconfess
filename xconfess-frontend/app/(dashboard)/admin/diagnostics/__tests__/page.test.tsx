/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DiagnosticsPage from "../page";
import { adminApi } from "@/app/lib/api/admin";
import type { StellarDiagnosticsResponse } from "@/app/lib/types/stellar";

jest.mock("@/app/lib/api/admin", () => ({
  adminApi: {
    getStellarDiagnostics: jest.fn(),
  },
}));

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

const diagnosticsPayload: StellarDiagnosticsResponse = {
  network: "testnet",
  horizonUrl: "https://horizon-testnet.stellar.org",
  sorobanRpcUrl: "https://soroban-rpc-testnet.stellar.org",
  contractIds: {
    confessionAnchor: "CANCHOR1234567890ABCDEFG",
    reputationBadges: null,
    tippingSystem: "CTIP1234567890ABCDEFG",
  },
  deploymentMetadata: {
    loaded: true,
    generatedAtUtc: "2026-01-01T00:00:00Z",
    isStale: false,
    ageDays: 1,
    loadError: null,
  },
  horizon: {
    status: "ok",
    latencyMs: 42,
    checkedAt: "2026-06-18T01:30:00.000Z",
    error: null,
  },
};

describe("DiagnosticsPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders Stellar diagnostics and contract metadata", async () => {
    (adminApi.getStellarDiagnostics as jest.Mock).mockResolvedValue(
      diagnosticsPayload,
    );

    renderWithProviders(<DiagnosticsPage />);

    expect(screen.getByText("Stellar Diagnostics")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Reachable")).toBeInTheDocument();
      expect(screen.getByText("42 ms")).toBeInTheDocument();
      expect(screen.getByText("Confession Anchor")).toBeInTheDocument();
      expect(screen.getAllByText("Not configured")).toHaveLength(2);
    });

    expect(adminApi.getStellarDiagnostics).toHaveBeenCalledTimes(1);
  });

  it("shows degraded Horizon state without hiding config", async () => {
    (adminApi.getStellarDiagnostics as jest.Mock).mockResolvedValue({
      ...diagnosticsPayload,
      horizon: {
        status: "warning",
        latencyMs: null,
        checkedAt: "2026-06-18T01:30:00.000Z",
        error: "connect ETIMEDOUT",
      },
    });

    renderWithProviders(<DiagnosticsPage />);

    await waitFor(() => {
      expect(screen.getByText("Warning")).toBeInTheDocument();
      expect(
        screen.getByText(/Horizon ping failed: connect ETIMEDOUT/),
      ).toBeInTheDocument();
      expect(
        screen.getByText("https://horizon-testnet.stellar.org"),
      ).toBeInTheDocument();
    });
  });

  it("shows an endpoint error when admin diagnostics cannot load", async () => {
    (adminApi.getStellarDiagnostics as jest.Mock).mockRejectedValue(
      new Error("API failure"),
    );

    renderWithProviders(<DiagnosticsPage />);

    await waitFor(() => {
      expect(screen.getByText("API failure")).toBeInTheDocument();
    });
  });
});
