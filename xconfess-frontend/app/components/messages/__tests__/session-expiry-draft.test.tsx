/**
 * @jest-environment jsdom
 */

import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { AuthGuard } from "@/app/components/AuthGuard";
import { MessageComposer } from "@/app/components/messages/MessageComposer";
import { useConversationDrafts } from "@/app/lib/hooks/useConversationDrafts";

const mockPush = jest.fn();
const mockPathname = jest.fn(() => "/messages");
let mockAuthState = {
  isAuthenticated: true,
  isLoading: false,
  isSessionExpired: false,
};
const sendMessage = jest.fn();

jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("@/app/lib/hooks/useAuth", () => ({
  useAuth: () => mockAuthState,
}));

function ComposedMessage() {
  const { getDraft, setDraft } = useConversationDrafts();
  const draft = getDraft("confession-1_sender-1");

  return (
    <MessageComposer
      value={draft}
      onChange={(value) => setDraft("confession-1_sender-1", value)}
      onSend={sendMessage}
      placeholder="Send encrypted message..."
      label="Send encrypted message"
    />
  );
}

beforeEach(() => {
  sessionStorage.clear();
  jest.clearAllMocks();
  mockPathname.mockReturnValue("/messages");
  mockAuthState = {
    isAuthenticated: true,
    isLoading: false,
    isSessionExpired: false,
  };
});

afterEach(() => {
  sessionStorage.clear();
});

it("keeps an in-progress draft across session expiry and never auto-sends it", () => {
  const { rerender } = render(
    <AuthGuard>
      <ComposedMessage />
    </AuthGuard>,
  );

  fireEvent.change(screen.getByLabelText("Send encrypted message"), {
    target: { value: "private unsent draft" },
  });

  mockAuthState = {
    isAuthenticated: false,
    isLoading: false,
    isSessionExpired: true,
  };
  rerender(
    <AuthGuard>
      <ComposedMessage />
    </AuthGuard>,
  );

  expect(screen.getByRole("heading", { name: "Session Expired" })).toBeInTheDocument();
  expect(screen.getByText(/saved in this tab.*will not be sent automatically/i)).toBeInTheDocument();
  expect(sendMessage).not.toHaveBeenCalled();

  mockAuthState = {
    isAuthenticated: true,
    isLoading: false,
    isSessionExpired: false,
  };
  rerender(
    <AuthGuard>
      <ComposedMessage />
    </AuthGuard>,
  );

  expect(screen.getByLabelText("Send encrypted message")).toHaveValue("private unsent draft");
  expect(sendMessage).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  expect(sendMessage).toHaveBeenCalledTimes(1);
});