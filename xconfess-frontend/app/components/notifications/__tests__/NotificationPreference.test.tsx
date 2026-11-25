/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { NotificationPreferences } from "../NotificationPreference";

jest.mock("@/app/lib/api/notification", () => ({
  notificationApi: {
    getPreferences: jest.fn(async () => ({
      userId: "u1",
      reaction: true,
      comment: true,
      tip: true,
      badge: true,
      mention: true,
      follow: true,
      emailNotifications: true,
      pushNotifications: true,
    })),
    updatePreferences: jest.fn(async () => undefined),
  },
}));

jest.mock("@/app/components/common/Toast", () => ({
  useGlobalToast: () => ({
    error: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
    info: jest.fn(),
  }),
}));

describe("NotificationPreferences — scope copy (#2310)", () => {
  it("shows a scope badge next to every notification type toggle", async () => {
    render(<NotificationPreferences onClose={jest.fn()} userId="u1" />);

    // Wait for the fetch to resolve and the list to render.
    await screen.findByText("Notification Types");

    // Each known scope is rendered at least once as an uppercase badge.
    for (const label of ["Content activity", "Social activity", "Financial activity", "Achievements"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1);
    }
  });

  it("explicitly distinguishes security-critical notifications in the help copy", async () => {
    render(<NotificationPreferences onClose={jest.fn()} userId="u1" />);
    await screen.findByText("Notification Types");

    expect(
      screen.getByText(
        /Security alerts \(sign-ins, device changes, password resets\) are always delivered/i,
      ),
    ).toBeInTheDocument();
  });

  it("maps each visible label to its backend scope via a data attribute", async () => {
    const { container } = render(
      <NotificationPreferences onClose={jest.fn()} userId="u1" />,
    );
    await screen.findByText("Notification Types");

    const byScope = (scope: string) =>
      container.querySelectorAll(`[data-notification-scope="${scope}"]`);

    expect(byScope("content").length).toBeGreaterThanOrEqual(2); // reaction + comment
    expect(byScope("social").length).toBeGreaterThanOrEqual(2); // mention + follow
    expect(byScope("financial").length).toBeGreaterThanOrEqual(1); // tip
    expect(byScope("achievement").length).toBeGreaterThanOrEqual(1); // badge
  });

  it("each description explains what firing means in operational terms", async () => {
    render(<NotificationPreferences onClose={jest.fn()} userId="u1" />);
    await screen.findByText("Notification Types");

    // The exact copy in the updated scope descriptions.
    expect(
      screen.getByText(
        /Fires when another user adds or removes a reaction on your confession/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/The on-chain receipt is still recorded whether this toggle is on or off/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Security alerts are still emailed even if this is off/i),
    ).toBeInTheDocument();
  });
});
