/**
 * @jest-environment jsdom
 */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ReactionPicker } from "../ReactionPicker";

// `ReactionPicker` wraps `ReactionButton`, which pulls in react-query and
// websocket plumbing. Mock the inner button so these tests focus on the
// picker's keyboard behaviour (#2304) without a backend.
jest.mock("../ReactionButtons", () => ({
  __esModule: true,
  ReactionButton: ({ type, count }: { type: string; count: number }) => (
    <button type="button" aria-label={`React with ${type}, count ${count}`}>
      {type} {count}
    </button>
  ),
}));

function renderPicker(
  overrides: Partial<React.ComponentProps<typeof ReactionPicker>> = {},
) {
  const onEscape = jest.fn();
  const utils = render(
    <ReactionPicker
      confessionId="c1"
      reactions={[
        { type: "like", count: 1 },
        { type: "love", count: 2 },
      ]}
      onEscape={onEscape}
      {...overrides}
    />,
  );
  return { ...utils, onEscape };
}

describe("ReactionPicker — keyboard navigation (#2304)", () => {
  it("renders as a toolbar with an accessible name", () => {
    renderPicker();

    const toolbar = screen.getByRole("toolbar", { name: "Reactions" });
    expect(toolbar).toBeInTheDocument();
  });

  it("marks each reaction button as a focusable tile", () => {
    renderPicker();

    const tiles = screen.getAllByRole("button");
    expect(tiles).toHaveLength(2);
    for (const tile of tiles) {
      expect(tile).toHaveAttribute("data-reaction-tile", "true");
    }
  });

  it("moves focus from like to love on ArrowRight and wraps back on the next press", () => {
    renderPicker();

    const buttons = screen.getAllByRole("button");
    buttons[0].focus();
    expect(buttons[0]).toHaveFocus();

    const toolbar = screen.getByRole("toolbar");
    fireEvent.keyDown(toolbar, { key: "ArrowRight" });
    expect(buttons[1]).toHaveFocus();

    fireEvent.keyDown(toolbar, { key: "ArrowRight" });
    // Wraps to the first.
    expect(buttons[0]).toHaveFocus();
  });

  it("moves focus backward on ArrowLeft and wraps to the last tile", () => {
    renderPicker();

    const buttons = screen.getAllByRole("button");
    buttons[0].focus();
    const toolbar = screen.getByRole("toolbar");

    fireEvent.keyDown(toolbar, { key: "ArrowLeft" });
    expect(buttons[1]).toHaveFocus();
  });

  it("Home / End jump to the first / last reaction", () => {
    renderPicker();

    const buttons = screen.getAllByRole("button");
    const toolbar = screen.getByRole("toolbar");

    buttons[1].focus();
    fireEvent.keyDown(toolbar, { key: "Home" });
    expect(buttons[0]).toHaveFocus();

    fireEvent.keyDown(toolbar, { key: "End" });
    expect(buttons[1]).toHaveFocus();
  });

  it("Escape blurs the focused tile and calls onEscape", () => {
    const { onEscape } = renderPicker();

    const buttons = screen.getAllByRole("button");
    buttons[0].focus();
    expect(buttons[0]).toHaveFocus();

    fireEvent.keyDown(screen.getByRole("toolbar"), { key: "Escape" });

    expect(buttons[0]).not.toHaveFocus();
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it("ignores Escape when no tile is focused and does not call onEscape", () => {
    const { onEscape } = renderPicker();

    fireEvent.keyDown(screen.getByRole("toolbar"), { key: "Escape" });

    expect(onEscape).not.toHaveBeenCalled();
  });
});
