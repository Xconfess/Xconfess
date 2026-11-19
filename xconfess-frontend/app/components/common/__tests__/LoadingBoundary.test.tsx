import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { LoadingBoundary } from "../LoadingBoundary";
import {
  getLoadingBoundaryConfig,
  LoadingBoundaryType,
} from "@/app/lib/hooks/useLoadingBoundary";

describe("LoadingBoundary", () => {
  const testContent = <div data-testid="content">Test Content</div>;

  it("renders children when not loading", () => {
    render(
      <LoadingBoundary isLoading={false} type="dashboard">
        {testContent}
      </LoadingBoundary>
    );

    expect(screen.getByTestId("content")).toBeInTheDocument();
  });

  it("displays skeleton loader when loading dashboard", () => {
    render(
      <LoadingBoundary isLoading={true} type="dashboard">
        {testContent}
      </LoadingBoundary>
    );

    const loader = screen.getByRole("status");
    expect(loader).toHaveAttribute("aria-busy", "true");
  });

  it("displays spinner loader for modal loading", () => {
    const { container } = render(
      <LoadingBoundary isLoading={true} type="modal">
        {testContent}
      </LoadingBoundary>
    );

    const spinner = container.querySelector("svg");
    expect(spinner).toBeInTheDocument();
  });

  it("renders custom fallback when provided", () => {
    const fallback = <div data-testid="fallback">Loading...</div>;

    render(
      <LoadingBoundary isLoading={true} type="dashboard" fallback={fallback}>
        {testContent}
      </LoadingBoundary>
    );

    expect(screen.getByTestId("fallback")).toBeInTheDocument();
    expect(screen.queryByTestId("content")).not.toBeInTheDocument();
  });

  it("preserves layout for dashboard skeleton loading", () => {
    const { container } = render(
      <LoadingBoundary isLoading={true} type="dashboard">
        <div data-testid="content" style={{ height: "200px", width: "100%" }}>
          Content
        </div>
      </LoadingBoundary>
    );

    const wrapper = container.querySelector('[aria-busy="true"]');
    // Skeleton should be invisible to preserve layout
    expect(wrapper).toHaveClass("invisible");
  });

  it("does not preserve layout for modal spinner loading", () => {
    const { container } = render(
      <LoadingBoundary isLoading={true} type="modal">
        {testContent}
      </LoadingBoundary>
    );

    const wrapper = container.querySelector('[aria-busy="true"]');
    // Spinner should not use invisible class
    expect(wrapper).not.toHaveClass("invisible");
  });

  it("sets appropriate aria-label for accessibility", () => {
    const types: LoadingBoundaryType[] = [
      "dashboard",
      "search",
      "profile",
      "feed",
      "modal",
      "form",
    ];

    types.forEach((type) => {
      const { unmount } = render(
        <LoadingBoundary isLoading={true} type={type}>
          {testContent}
        </LoadingBoundary>
      );

      const loader = screen.getByRole("status");
      const config = getLoadingBoundaryConfig(type);
      expect(loader).toHaveAttribute("aria-label", config.announcement);

      unmount();
    });
  });

  it("transitions between loading and loaded states", async () => {
    const { rerender } = render(
      <LoadingBoundary isLoading={true} type="feed">
        {testContent}
      </LoadingBoundary>
    );

    expect(screen.queryByTestId("content")).not.toBeInTheDocument();

    rerender(
      <LoadingBoundary isLoading={false} type="feed">
        {testContent}
      </LoadingBoundary>
    );

    await waitFor(() => {
      expect(screen.getByTestId("content")).toBeInTheDocument();
    });
  });

  it("displays multiple skeleton items for feed", () => {
    const { container } = render(
      <LoadingBoundary isLoading={true} type="feed">
        {testContent}
      </LoadingBoundary>
    );

    const skeletons = container.querySelectorAll("[class*='animate-pulse']");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("handles all loading boundary types", () => {
    const types: LoadingBoundaryType[] = [
      "dashboard",
      "search",
      "profile",
      "feed",
      "modal",
      "form",
    ];

    types.forEach((type) => {
      const { unmount, container } = render(
        <LoadingBoundary isLoading={true} type={type}>
          {testContent}
        </LoadingBoundary>
      );

      const loader = screen.getByRole("status");
      expect(loader).toBeInTheDocument();

      unmount();
    });
  });
});
