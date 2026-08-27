/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactionButton } from "../ReactionButtons";
import { addReaction } from "@/app/lib/api/reactions";

jest.mock("@/app/lib/api/reactions", () => ({
  addReaction: jest.fn(),
}));

let mockSocketHandlers: Record<string, (...args: unknown[]) => void> = {};
const mockSocket = {
  on: jest.fn(),
  emit: jest.fn(),
  disconnect: jest.fn(),
  io: {
    on: jest.fn(),
  },
};
const mockIo = jest.fn((..._args: unknown[]) => mockSocket);
jest.mock("socket.io-client", () => ({
  io: (...args: unknown[]) => mockIo(...args),
}));
jest.mock("@/app/lib/config", () => ({
  getWsUrl: () => "ws://localhost:5000",
}));

function triggerSocketEvent(event: string, ...args: unknown[]) {
  mockSocketHandlers[event]?.(...args);
}

// localStorage stub needed by the reactions API helper
Object.defineProperty(window, "localStorage", {
  value: { getItem: jest.fn(() => "anon-user-1"), setItem: jest.fn(), removeItem: jest.fn() },
  writable: true,
});

const mockAddReaction = addReaction as jest.MockedFunction<typeof addReaction>;

function createClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const client = React.useMemo(() => createClient(), []);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("ReactionButton — optimistic count and active state", () => {
  beforeEach(() => {
    mockSocketHandlers = {};
    jest.clearAllMocks();
    mockIo.mockReturnValue(mockSocket);
    mockSocket.on.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      mockSocketHandlers[event] = handler;
      return mockSocket;
    });
    mockSocket.io.on.mockReturnValue(mockSocket.io);
  });

  it("shows the initial count from the prop", () => {
    mockAddReaction.mockReturnValue(new Promise(() => {}));
    render(
      <Wrapper>
        <ReactionButton type="like" count={5} confessionId="c-1" />
      </Wrapper>,
    );
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("shows an incremented count immediately while the mutation is in flight", async () => {
    // Never resolves — keeps mutation in pending state
    mockAddReaction.mockReturnValue(new Promise(() => {}));

    render(
      <Wrapper>
        <ReactionButton type="like" count={5} confessionId="c-1" />
      </Wrapper>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });

    expect(screen.getByText("6")).toBeInTheDocument();
  });

  it("marks the button as pressed while the mutation is in flight", async () => {
    mockAddReaction.mockReturnValue(new Promise(() => {}));

    render(
      <Wrapper>
        <ReactionButton type="like" count={5} confessionId="c-1" />
      </Wrapper>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });

    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("rolls back the displayed count when the reaction API fails (feed surface)", async () => {
    mockAddReaction.mockResolvedValue({
      ok: false,
      error: { message: "Network error", code: "API_ERROR" },
    });

    render(
      <Wrapper>
        <ReactionButton type="like" count={5} confessionId="c-1" />
      </Wrapper>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });

    await waitFor(() => {
      expect(screen.getByText("5")).toBeInTheDocument();
    });
  });

  it("rolls back the active (selected) state when the reaction API fails", async () => {
    mockAddReaction.mockResolvedValue({
      ok: false,
      error: { message: "Network error", code: "API_ERROR" },
    });

    render(
      <Wrapper>
        <ReactionButton type="love" count={3} confessionId="c-1" />
      </Wrapper>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });

    await waitFor(() => {
      expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");
    });
  });

  it("rolls back the displayed count when the reaction API fails (detail surface)", async () => {
    // Identical rollback behaviour regardless of surface — the ReactionButton
    // component is the same; surfaces differ only in how the count prop is
    // sourced (feed InfiniteQuery vs detail Query), tested at the hook level.
    mockAddReaction.mockResolvedValue({
      ok: false,
      error: { message: "Server rejected reaction", code: "API_ERROR" },
    });

    render(
      <Wrapper>
        <ReactionButton type="love" count={7} confessionId="c-2" />
      </Wrapper>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });

    await waitFor(() => {
      expect(screen.getByText("7")).toBeInTheDocument();
    });
  });

  it("shows an error message when the reaction fails", async () => {
    mockAddReaction.mockResolvedValue({
      ok: false,
      error: { message: "Too many reactions", code: "RATE_LIMIT" },
    });

    render(
      <Wrapper>
        <ReactionButton type="like" count={2} confessionId="c-3" />
      </Wrapper>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Too many reactions");
    });
  });

  it("shows rate limit error with retryAfter countdown", async () => {
    mockAddReaction.mockResolvedValue({
      ok: false,
      error: { message: "Too many reactions", code: "TOO_MANY_REQUESTS", retryAfter: 45 },
    });

    render(
      <Wrapper>
        <ReactionButton type="like" count={2} confessionId="c-5" />
      </Wrapper>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Too many reactions. Please wait 45s.");
    });
  });

  it("updates count and marks active on successful reaction", async () => {
    let resolve: (v: Awaited<ReturnType<typeof addReaction>>) => void;
    mockAddReaction.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );

    render(
      <Wrapper>
        <ReactionButton type="like" count={4} confessionId="c-4" />
      </Wrapper>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });
    // Optimistic update: count+1 and active
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");

    await act(async () => {
      resolve!({
        ok: true,
        data: { success: true, reactions: { like: 5, love: 0 } },
      });
    });
    // Server confirms: count stays at 5
    await waitFor(() => {
      expect(screen.getByText("5")).toBeInTheDocument();
    });
  });

  it("reflects live websocket state in the reaction status indicator", async () => {
    mockAddReaction.mockReturnValue(new Promise(() => {}));

    render(
      <Wrapper>
        <ReactionButton type="like" count={5} confessionId="c-live" />
      </Wrapper>,
    );

    await act(async () => {
      triggerSocketEvent("connect");
    });
    expect(screen.getByLabelText("Reaction live status: connected")).toBeInTheDocument();

    await act(async () => {
      triggerSocketEvent("disconnect");
    });
    expect(screen.getByLabelText("Reaction live status: reconnecting")).toBeInTheDocument();
  });
});