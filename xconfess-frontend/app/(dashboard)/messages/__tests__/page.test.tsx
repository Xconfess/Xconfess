import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import apiClient from "@/app/lib/api/client";
import { useMessageE2E } from "@/app/lib/hooks/useMessageE2E";
import MessagesPage from "../page";
import { PENDING_MESSAGE_DRAFT_KEY } from "@/app/lib/utils/pendingMessageDraft";

const mockToast = {
  error: jest.fn(),
  success: jest.fn(),
  warning: jest.fn(),
};

jest.mock("@/app/lib/api/client", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

jest.mock("@/app/lib/hooks/useMessageE2E", () => ({
  useMessageE2E: jest.fn(),
}));

jest.mock("@/app/components/AuthGuard", () => ({
  AuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock("@/app/components/common/Toast", () => ({
  useGlobalToast: () => mockToast,
}));

jest.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
}));

const mockGet = apiClient.get as jest.Mock;
const mockPost = apiClient.post as jest.Mock;
const mockUseMessageE2E = useMessageE2E as jest.Mock;
const thread = {
  confessionId: "confession-1",
  senderId: "sender-1",
  authorAnonymousUserId: "author-1",
  confessionMessage: "A private confession",
  lastMessage: "Encrypted message",
  lastMessageAt: "2026-10-21T12:00:00.000Z",
  hasUnread: false,
  isAuthor: false,
};

function preparePage() {
  mockUseMessageE2E.mockReturnValue({
    isReady: true,
    keyError: null,
    needsKeyRecovery: false,
    session: { anonymousUserId: "identity-1", hasBackup: true },
    encryptForThread: jest.fn().mockResolvedValue("encrypted-content"),
    decryptForThread: jest.fn().mockResolvedValue("decrypted-content"),
    createKeyBackup: jest.fn(),
    restoreFromBackup: jest.fn(),
    startFreshKeys: jest.fn(),
  });
  mockGet.mockImplementation((url: string) => {
    if (url === "/messages/threads") {
      return Promise.resolve({ data: [thread] });
    }
    if (url.startsWith("/messages?")) {
      return Promise.resolve({ data: [] });
    }
    throw new Error(`Unexpected GET ${url}`);
  });
}

beforeEach(() => {
  sessionStorage.clear();
  jest.clearAllMocks();
  preparePage();
});

describe("MessagesPage session expiry during compose", () => {
  it("preserves a draft for re-authentication and never sends it automatically", async () => {
    mockPost.mockRejectedValueOnce({ response: { status: 401 } });
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    const firstRender = render(<MessagesPage />);
    fireEvent.click((await screen.findAllByText("A private confession"))[0]);

    const firstInput = screen.getAllByPlaceholderText("Send encrypted message...")[0];
    fireEvent.change(firstInput, { target: { value: "Please keep this private" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Send encrypted message" })[0]);

    await waitFor(() => {
      expect(sessionStorage.getItem(PENDING_MESSAGE_DRAFT_KEY)).not.toBeNull();
    });
    expect(JSON.parse(sessionStorage.getItem(PENDING_MESSAGE_DRAFT_KEY) ?? "")).toEqual({
      anonymousUserId: "identity-1",
      confessionId: "confession-1",
      senderId: "sender-1",
      content: "Please keep this private",
    });
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      "Please keep this private",
    );
    firstRender.unmount();

    render(<MessagesPage />);
    fireEvent.click((await screen.findAllByText("A private confession"))[0]);

    expect(
      await screen.findAllByText(
        "Your unsent draft was restored. Review it and choose Send when you are ready.",
      ),
    ).toHaveLength(2);
    expect(
      screen.getAllByPlaceholderText("Send encrypted message...")[0],
    ).toHaveValue("Please keep this private");
    expect(mockPost).toHaveBeenCalledTimes(1);

    mockPost.mockResolvedValueOnce({ data: {} });
    fireEvent.click(screen.getAllByRole("button", { name: "Send encrypted message" })[0]);
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
    expect(sessionStorage.getItem(PENDING_MESSAGE_DRAFT_KEY)).toBeNull();
    consoleError.mockRestore();
  });
});
