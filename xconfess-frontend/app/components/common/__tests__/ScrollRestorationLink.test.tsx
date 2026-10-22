/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScrollRestorationLink } from "../ScrollRestorationLink";
import { SCROLL_POSITION_STORAGE_KEY } from "@/app/lib/utils/scrollPositions";

function renderAnchoredItem(id: string, documentTop: number) {
  const element = document.createElement("div");
  element.setAttribute("data-scroll-anchor", id);
  element.getBoundingClientRect = () =>
    ({
      top: documentTop - window.scrollY,
      bottom: documentTop - window.scrollY + 300,
      height: 300,
      left: 0,
      right: 0,
      width: 0,
      x: 0,
      y: documentTop - window.scrollY,
      toJSON: () => ({}),
    }) as DOMRect;
  document.body.appendChild(element);
  return element;
}

function readStoredPositions() {
  const raw = sessionStorage.getItem(SCROLL_POSITION_STORAGE_KEY);
  return raw ? JSON.parse(raw) : {};
}

describe("ScrollRestorationLink", () => {
  beforeEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = "";
    Object.defineProperty(window, "scrollY", { value: 350, configurable: true });
    window.history.pushState({}, "", "/confessions");
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("saves the offset and the anchored item before navigating away", async () => {
    renderAnchoredItem("confession-2", 300);
    const user = userEvent.setup();

    render(
      <ScrollRestorationLink href="/confessions/confession-2">
        Read confession
      </ScrollRestorationLink>,
    );

    await user.click(screen.getByRole("link", { name: "Read confession" }));

    const stored = readStoredPositions();
    expect(stored["/confessions"].y).toBe(350);
    expect(stored["/confessions"].anchor).toEqual({ id: "confession-2", offset: -50 });
  });

  it("still saves the offset when the page has no anchored items", async () => {
    const user = userEvent.setup();

    render(
      <ScrollRestorationLink href="/confessions/other">
        Read confession
      </ScrollRestorationLink>,
    );

    await user.click(screen.getByRole("link", { name: "Read confession" }));

    const stored = readStoredPositions();
    expect(stored["/confessions"].y).toBe(350);
    expect(stored["/confessions"].anchor).toBeNull();
  });
});
