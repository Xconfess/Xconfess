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
const mockLogin = jest.fn();
jest.mock("@/app/lib/hooks/useAuth", () => ({
  useAuth: () => ({ login: mockLogin }),
}));

// Import the component after mocks
import LoginPage from "../page";

describe("LoginPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the Create account navigation button that routes to /register", async () => {
    render(<LoginPage />);

    // Find the "Create account" button
    const createAccountButton = screen.getByRole("button", { name: /create account/i });
    expect(createAccountButton).toBeInTheDocument();

    // Click the button
    await userEvent.click(createAccountButton);

    // Verify it navigates to /register
    expect(mockPush).toHaveBeenCalledWith("/register");
  });
});