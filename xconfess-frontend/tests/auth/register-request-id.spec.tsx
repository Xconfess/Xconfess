import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppError } from "@/app/lib/utils/errorHandler";

const mockPush = jest.fn();
const mockRegister = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("@/app/lib/hooks/useAuth", () => ({
  useAuth: () => ({ register: mockRegister }),
}));

import RegisterPage from "@/app/(auth)/register/page";

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Username"), "alice42");
  await user.type(screen.getByLabelText("Email"), "alice@example.com");
  await user.type(screen.getByLabelText("Password"), "Str0ng!Pass#1");
  await user.type(screen.getByLabelText("Confirm password"), "Str0ng!Pass#1");
}

describe("RegisterPage request id affordance", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("surfaces the request id when registration fails", async () => {
    mockRegister.mockRejectedValueOnce(
      new AppError("Email already exists", "ALREADY_EXISTS", 409, {
        requestId: "reg-req-77",
        responseBody: { message: "Email already exists" },
      }),
    );

    const user = userEvent.setup();
    render(<RegisterPage />);
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    const requestId = await screen.findByTestId("auth-request-id");
    expect(requestId).toHaveTextContent("reg-req-77");

    await user.click(screen.getByRole("button", { name: /copy request id/i }));
    expect(await screen.findByText(/copied/i)).toBeInTheDocument();
    await waitFor(async () =>
      expect(await navigator.clipboard.readText()).toBe("reg-req-77"),
    );
  });

  it("does not render the notice when no request id is present", async () => {
    mockRegister.mockRejectedValueOnce(
      new AppError("Something went wrong", "REGISTER_FAILED", 500, {}),
    );

    const user = userEvent.setup();
    render(<RegisterPage />);
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.queryByTestId("auth-request-id")).not.toBeInTheDocument();
  });
});
