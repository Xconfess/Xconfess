/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeToggle } from "../ThemeToggle";

jest.mock("../../../lib/hooks/useTheme", () => ({
  useTheme: () => ({ theme: "system", setTheme: jest.fn() }),
}));

describe("ThemeToggle", () => {
  it("renders all three accessible mode buttons after mount", () => {
    render(<ThemeToggle />);

    expect(
      screen.getByRole("button", { name: "Light mode" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Dark mode" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "System preference" }),
    ).toBeInTheDocument();
  });
});
