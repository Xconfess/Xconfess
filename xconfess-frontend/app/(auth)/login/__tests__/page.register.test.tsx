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
    login: jest.fn(),
  }),
}));

// Import after mocks are set up
import LoginPage from "../page";

describe("LoginPage — Create account navigation", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it("navigates to /register when the Create account button is clicked", () => {
    render(<LoginPage />);

    const createAccountButton = screen.getByRole("button", {
      name: "Create account",
    });
    expect(createAccountButton).toBeInTheDocument();

    fireEvent.click(createAccountButton);

    expect(mockPush).toHaveBeenCalledWith("/register");
  });

  it("renders the Create account button with the register destination", () => {
    render(<LoginPage />);

    const createAccountButton = screen.getByRole("button", {
      name: "Create account",
    });
    expect(createAccountButton).toBeInTheDocument();
    expect(createAccountButton).not.toBeDisabled();
  });
});