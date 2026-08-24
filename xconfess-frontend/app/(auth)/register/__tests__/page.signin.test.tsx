/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

const mockPush = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("@/app/lib/hooks/useAuth", () => ({
  useAuth: () => ({
    register: jest.fn(),
  }),
}));

// Import after mocks are set up
import RegisterPage from "../page";

describe("RegisterPage — Sign in navigation", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it("navigates to /login when the Sign in button is clicked", () => {
    render(<RegisterPage />);

    const signInButton = screen.getByRole("button", { name: "Sign in" });
    expect(signInButton).toBeInTheDocument();

    fireEvent.click(signInButton);

    expect(mockPush).toHaveBeenCalledWith("/login");
  });

  it("renders an inline Sign in link that points to /login", () => {
    render(<RegisterPage />);

    const signInLink = screen.getByRole("link", { name: "Sign in" });
    expect(signInLink).toBeInTheDocument();
    expect(signInLink).toHaveAttribute("href", "/login");
  });
});