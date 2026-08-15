import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnchorButton } from "@/app/components/confession/AnchorButton";
import { useStellarWallet } from "@/lib/hooks/useStellarWallet";
import { readyForAnchor, successfulAnchorResult, getAnchorFetchMockResponse } from "@/tests/mocks/anchor-fixtures";

jest.mock("@/lib/hooks/useStellarWallet", () => ({
  useStellarWallet: jest.fn(),
}));

const mockUseStellarWallet = useStellarWallet as jest.MockedFunction<typeof useStellarWallet>;

describe("AnchorButton Duplicate Submission", () => {
  const mockAnchor = jest.fn();
  const mockConnect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockImplementation(() => getAnchorFetchMockResponse("success"));
    mockUseStellarWallet.mockReturnValue({
      ...readyForAnchor(),
      anchor: mockAnchor,
      connect: mockConnect,
      isLoading: false,
    });
  });

  it("prevents duplicate anchor submissions while one is in-flight", async () => {
    const user = userEvent.setup();
    
    // Create a deferred promise that we can resolve manually
    let resolveAnchor: (value: any) => void;
    const anchorPromise = new Promise((resolve) => {
      resolveAnchor = resolve;
    });
    
    mockAnchor.mockReturnValue(anchorPromise);

    render(
      <AnchorButton
        confessionId="confession-123"
        confessionContent="Test confession content"
      />
    );

    const anchorButton = screen.getByRole("button", { name: /anchor/i });

    // First click
    await user.click(anchorButton);
    expect(mockAnchor).toHaveBeenCalledTimes(1);

    // Second click while in-flight
    // The button should be disabled, but we'll try to click it anyway
    // userEvent.click might throw or ignore if disabled, so we check the attribute
    expect(anchorButton).toBeDisabled();
    
    // Attempt multiple clicks
    await user.click(anchorButton);
    await user.click(anchorButton);
    
    // Should still only be called once
    expect(mockAnchor).toHaveBeenCalledTimes(1);

    // Resolve the promise
    resolveAnchor!(successfulAnchorResult);

    await waitFor(() => {
      expect(screen.getByText("Anchored")).toBeInTheDocument();
    });
  });
});
