/**
 * @jest-environment jsdom
 *
 * Regression check for #2085 — keyboard focus visibility on interactive
 * confession cards.
 *
 * Covers the feed card (`ConfessionCard`) and the related-confessions cards on
 * the detail page. Every link and button rendered inside a card must keep a
 * `:focus-visible` indicator; if a future change drops one (for example by
 * adding `focus:outline-none` without a replacement), these tests fail.
 *
 * The indicator is scoped to `:focus-visible`, so pointer/touch appearance is
 * unchanged — that is asserted structurally by requiring the `focus-visible:`
 * variant rather than a bare `focus:` style.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { axe, toHaveNoViolations } from "jest-axe";

expect.extend(toHaveNoViolations);

// ---------------------------------------------------------------------------
// Mocks — the card aggregates several controls, so stub the data/wallet layers
// and render the real presentational components (that is what we are testing).
// ---------------------------------------------------------------------------

jest.mock("next/link", () => {
  return ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => {
    const React = require("react");
    return React.createElement("a", { href, ...rest }, children);
  };
});

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    const React = require("react");
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return React.createElement("img", props);
  },
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  usePathname: () => "/confessions",
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock("@/lib/services/tipping.service", () => ({
  getTipStats: jest.fn().mockResolvedValue({
    totalAmount: 0,
    totalCount: 0,
    averageAmount: 0,
  }),
}));

jest.mock("@/lib/hooks/useWallet", () => ({
  useWallet: () => ({ isConnected: false, publicKey: null, connect: jest.fn() }),
}));

jest.mock("@/lib/hooks/useWalletCTAState", () => ({
  getWalletCTAState: () => ({ status: "idle", disabled: false, guidance: "" }),
}));

jest.mock("@/lib/hooks/useTipStateMachine", () => ({
  useTipStateMachine: () => ({
    info: { state: "idle", isBusy: false, txHash: null, explorerUrl: null, error: null, amount: null },
    submit: jest.fn(),
    retryVerify: jest.fn(),
    cancel: jest.fn(),
    reset: jest.fn(),
  }),
}));

jest.mock("@/lib/hooks/useStellarWallet", () => ({
  useStellarWallet: () => ({
    isAvailable: false,
    isEmbeddedWallet: false,
    isConnected: false,
    isReady: false,
    readinessError: null,
    connect: jest.fn(),
    anchor: jest.fn(),
    isLoading: false,
    network: "TESTNET",
  }),
}));

jest.mock("@/app/lib/hooks/useReactions", () => ({
  useReactions: () => ({
    addReaction: jest.fn(),
    isPending: false,
    optimisticState: null,
    liveCounts: null,
    connectionState: "connected",
  }),
}));

jest.mock("@/app/lib/store/activity.store", () => ({
  useActivityStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ addActivity: jest.fn(), updateActivity: jest.fn() }),
}));

jest.mock("@/app/lib/api/confessions", () => ({
  getConfessions: jest.fn(),
}));

import { ConfessionCard } from "@/app/components/confession/ConfessionCard";
import { ShareButton } from "@/app/components/confession/ShareButton";
import { RelatedConfessions } from "@/app/components/confession/RelatedConfessions";
import { getConfessions } from "@/app/lib/api/confessions";

const confession = {
  id: "c-1",
  content: "A confession long enough to be read on the feed card.",
  createdAt: new Date().toISOString(),
  viewCount: 3,
  commentCount: 2,
  reactions: { like: 1, love: 2 },
  author: { username: "anon", avatar: null, stellarAddress: "GABC" },
  isAnchored: false,
  stellarTxHash: null,
};

/**
 * The core assertion: every interactive control inside a card carries a
 * `focus-visible:` variant so keyboard users always see where focus is.
 */
function expectAllControlsKeepFocusIndicator(container: HTMLElement) {
  const controls = Array.from(
    container.querySelectorAll<HTMLElement>("a, button"),
  );
  expect(controls.length).toBeGreaterThan(0);
  for (const control of controls) {
    expect(control.className).toMatch(/focus-visible:/);
  }
}

describe("#2085 confession card focus visibility", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("keeps a focus indicator on every link and button in the feed card", async () => {
    const { container } = render(
      <ConfessionCard confession={confession as never} />,
    );

    expectAllControlsKeepFocusIndicator(container);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("keeps the feed card controls reachable by Tab", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ConfessionCard confession={confession as never} />,
    );

    await user.tab();

    const controls = Array.from(container.querySelectorAll("a, button"));
    expect(controls).toContain(document.activeElement);
  });

  it("keeps a focus indicator on every share menu item", async () => {
    const user = userEvent.setup();
    render(<ShareButton confessionId="c-1" variant="dropdown" />);

    await user.click(screen.getByRole("button", { name: /share options/i }));

    const items = screen.getAllByRole("menuitem");
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.className).toMatch(/focus-visible:/);
    }
  });

  it("keeps a focus indicator on the related-confession card link", async () => {
    (getConfessions as jest.Mock).mockResolvedValue({
      ok: true,
      data: {
        confessions: [
          {
            id: "c-2",
            content: "A related confession.",
            createdAt: new Date().toISOString(),
            reactions: { like: 0, love: 0 },
            commentCount: 1,
          },
        ],
      },
    });

    const { container } = render(<RelatedConfessions currentId="c-1" />);

    const link = await screen.findByRole("link");
    expect(link.className).toMatch(/focus-visible:/);
    expectAllControlsKeepFocusIndicator(container);
    expect(await axe(container)).toHaveNoViolations();
  });
});
