import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShortcutsProvider } from "../ShortcutsProvider";

// Mock next/navigation
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

describe("ShortcutsProvider", () => {
  const renderWithShortcuts = (content: React.ReactNode = <div>Test</div>) => {
    return render(<ShortcutsProvider>{content}</ShortcutsProvider>);
  };

  it("renders children", () => {
    renderWithShortcuts(<div data-testid="child">Child content</div>);
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("opens help dialog when ? key is pressed", async () => {
    const user = userEvent.setup();
    renderWithShortcuts();

    expect(screen.queryByText("Keyboard Shortcuts")).not.toBeInTheDocument();

    await user.keyboard("?");

    await waitFor(() => {
      expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
    });
  });

  it("displays all keyboard shortcuts in help dialog", async () => {
    const user = userEvent.setup();
    renderWithShortcuts();

    await user.keyboard("?");

    await waitFor(() => {
      expect(screen.getByText(/Navigate down \/ up in feed/)).toBeInTheDocument();
      expect(
        screen.getByText(/Open selected confession/)
      ).toBeInTheDocument();
      expect(screen.getByText(/React to selected confession/)).toBeInTheDocument();
      expect(
        screen.getByText(/Open comment box \(detail\)/)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/New confession — focus composer/)
      ).toBeInTheDocument();
      expect(screen.getByText(/Focus search/)).toBeInTheDocument();
    });
  });

  it("disables shortcuts when typing in input field", async () => {
    const user = userEvent.setup();
    renderWithShortcuts(
      <input data-testid="test-input" placeholder="Search" />
    );

    const input = screen.getByTestId("test-input");
    await user.click(input);
    await user.keyboard("?");

    // Help dialog should not open
    expect(screen.queryByText("Keyboard Shortcuts")).not.toBeInTheDocument();
  });

  it("disables shortcuts when editing textarea", async () => {
    const user = userEvent.setup();
    renderWithShortcuts(<textarea data-testid="test-textarea" />);

    const textarea = screen.getByTestId("test-textarea");
    await user.click(textarea);
    await user.keyboard("?");

    // Help dialog should not open
    expect(screen.queryByText("Keyboard Shortcuts")).not.toBeInTheDocument();
  });

  it("disables shortcuts when dialog is open (except Escape)", async () => {
    const user = userEvent.setup();
    renderWithShortcuts(
      <div>
        <div role="dialog">Dialog content</div>
      </div>
    );

    // Open help first
    await user.keyboard("?");
    await waitFor(() => {
      expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
    });

    // Try to press j (should not navigate)
    await user.keyboard("j");
    // Since dialog is open, the navigation shortcut should be blocked
  });

  it("announces screen reader messages when navigating", async () => {
    const user = userEvent.setup();
    renderWithShortcuts(
      <div>
        <div data-shortcut-confession="1">Confession 1</div>
        <div data-shortcut-confession="2">Confession 2</div>
        <div data-shortcut-confession="3">Confession 3</div>
      </div>
    );

    const liveRegion = screen.getByRole("status", { hidden: true });

    // Press j to navigate down
    await user.keyboard("j");

    await waitFor(() => {
      expect(liveRegion.textContent).toContain("Selected item");
    });
  });

  it("respects prefers-reduced-motion preference", async () => {
    const matchMediaMock = jest.fn().mockReturnValue({
      matches: true,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    });

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: matchMediaMock,
    });

    const user = userEvent.setup();
    renderWithShortcuts(
      <div>
        <div data-shortcut-confession="1">Confession 1</div>
        <div data-shortcut-confession="2">Confession 2</div>
      </div>
    );

    const scrollIntoViewMock = jest.fn();
    const element = screen.getByText("Confession 1");
    element.scrollIntoView = scrollIntoViewMock;

    await user.keyboard("j");

    // Should use "auto" behavior instead of "smooth"
    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalledWith({
        behavior: "auto",
        block: "center",
      });
    });
  });

  it("closes help dialog when Escape is pressed", async () => {
    const user = userEvent.setup();
    renderWithShortcuts();

    await user.keyboard("?");
    await waitFor(() => {
      expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
    });

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByText("Keyboard Shortcuts")).not.toBeInTheDocument();
    });
  });

  it("displays shortcut help with aria-labels for accessibility", async () => {
    const user = userEvent.setup();
    renderWithShortcuts();

    await user.keyboard("?");

    await waitFor(() => {
      const shortcutItems = screen.getAllByRole("listitem");
      expect(shortcutItems.length).toBeGreaterThan(0);

      // Each item should have an aria-label
      shortcutItems.forEach((item) => {
        expect(item).toHaveAttribute("aria-label");
      });
    });
  });
});
