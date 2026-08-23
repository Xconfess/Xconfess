/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock environment variables
process.env.NEXT_PUBLIC_API_URL = "http://localhost:3000";

// Mock next/navigation
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock useAuth
const mockRegister = jest.fn();
jest.mock("@/app/lib/hooks/useAuth", () => ({
  useAuth: () => ({ register: mockRegister }),
}));

// Mock error utilities
jest.mock("@/app/lib/utils/errorHandler", () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : "Unknown error"),
}));

jest.mock("@/app/lib/api/authService", () => ({
  getAuthFieldError: () => null,
}));

// Import the component after mocks
import RegisterPage from "../page";

describe("RegisterPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the Sign in navigation button that routes to /login", async () => {
    render(<RegisterPage />);

    // Find the "Sign in" button (the button-style one, not the inline Link)
    const signInButton = screen.getByRole("button", { name: /sign in/i });
    expect(signInButton).toBeInTheDocument();

    // Click the button
    await userEvent.click(signInButton);

    // Verify it navigates to /login
    expect(mockPush).toHaveBeenCalledWith("/login");
  });

  it("renders the inline Sign in link that points to /login", () => {
    render(<RegisterPage />);

    // Find the inline link (the <Link> component)
    const signInLink = screen.getByRole("link", { name: /sign in/i });
    expect(signInLink).toBeInTheDocument();
    expect(signInLink).toHaveAttribute("href", "/login");
  });
});