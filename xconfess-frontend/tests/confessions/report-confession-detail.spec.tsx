import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfessionDetailClient } from "@/app/(dashboard)/confessions/[id]/ConfessionDetailClient";
import { useAuth } from "@/app/lib/hooks/useAuth";
import { createConfessionReport } from "@/app/lib/api/reports";
import { useRouter } from "next/navigation";

jest.mock("@/app/lib/hooks/useAuth", () => ({
  useAuth: jest.fn(),
}));

jest.mock("@/app/lib/api/reports", () => ({
  createConfessionReport: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
  usePathname: () => "/confessions/confession-123",
}));

jest.mock("@/app/components/confession/ReactionButtons", () => ({
  ReactionButton: () => <div />,
}));

jest.mock("@/app/components/confession/AnchorButton", () => ({
  AnchorButton: () => <div />,
}));

jest.mock("@/app/components/confession/ShareButton", () => ({
  ShareButton: () => <div />,
}));

jest.mock("@/app/components/confession/CommentSection", () => ({
  CommentSection: () => <div />,
}));

jest.mock("@/app/components/confession/RelatedConfessions", () => ({
  RelatedConfessions: () => <div />,
}));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockUseRouter = useRouter as unknown as jest.MockedFunction<typeof useRouter>;
const mockCreateConfessionReport = createConfessionReport as jest.MockedFunction<
  typeof createConfessionReport
>;

function renderDetail() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfessionDetailClient
        confessionId="confession-123"
        initialConfession={{
          id: "confession-123",
          content: "hello",
          createdAt: new Date().toISOString(),
          viewCount: 10,
          reactions: { like: 1, love: 2 },
          commentCount: 0,
          isAnchored: false,
          stellarTxHash: null,
        }}
      />
    </QueryClientProvider>,
  );
}

describe("ConfessionDetailClient report flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUseAuth.mockReturnValue({ user: null } as any);
    mockUseRouter.mockReturnValue({
      back: jest.fn(),
      push: jest.fn(),
    } as any);
  });

  it("submits a report and shows success state", async () => {
    mockCreateConfessionReport.mockResolvedValue({
      ok: true,
      data: { id: "r1" },
    });

    const user = userEvent.setup();
    renderDetail();

    const reportButton = screen.getByRole("button", { name: /report confession/i });
    await user.click(reportButton);

    await waitFor(() =>
      expect(mockCreateConfessionReport).toHaveBeenCalledWith("confession-123", {
        type: "other",
      }),
    );

    expect(
      await screen.findByText(/report submitted/i),
    ).toBeInTheDocument();
  });

  it("shows pending UI while the report request is in-flight", async () => {
    let resolveFn: (value: any) => void = () => {};
    const pending = new Promise((resolve) => {
      resolveFn = resolve;
    });

    mockCreateConfessionReport.mockReturnValue(pending as any);

    const user = userEvent.setup();
    renderDetail();

    const reportButton = screen.getByRole("button", { name: /report confession/i });
    await user.click(reportButton);

    await waitFor(() => expect(mockCreateConfessionReport).toHaveBeenCalled());
    expect(reportButton).toBeDisabled();
    expect(reportButton.textContent?.toLowerCase()).toContain("reporting");
    expect(screen.getByText(/submitting report/i)).toBeInTheDocument();

    resolveFn({ ok: true, data: {} });
    expect(
      await screen.findByText(/report submitted/i),
    ).toBeInTheDocument();
  });

  it("shows an error message when the report submission fails", async () => {
    mockCreateConfessionReport.mockResolvedValue({
      ok: false,
      error: { message: "Duplicate report", code: "BAD_REQUEST" },
    } as any);

    const user = userEvent.setup();
    renderDetail();

    const reportButton = screen.getByRole("button", { name: /report confession/i });
    await user.click(reportButton);

    expect(
      await screen.findByText(/duplicate report/i),
    ).toBeInTheDocument();
  });
});
