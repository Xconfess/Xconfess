/**
 * @jest-environment jsdom
 */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { SearchResults } from "../SearchResults";
import type { SearchConfession } from "@/app/lib/types/search";

jest.mock("../SearchResultItem", () => ({
  SearchResultItem: ({
    confession,
  }: {
    confession: SearchConfession;
    searchQuery?: string;
  }) => <div data-testid="search-result-item">{confession.content}</div>,
}));

jest.mock("@/app/components/confession/LoadingSkeleton", () => ({
  SkeletonCard: () => <div data-testid="search-skeleton" />,
}));

const result: SearchConfession = {
  id: "confession-1",
  content: "A searchable confession",
  createdAt: "2026-01-01T00:00:00.000Z",
  reactions: { like: 4, love: 0 },
  commentCount: 1,
};

describe("SearchResults states", () => {
  it("shows skeleton rows during first-page loading", () => {
    render(
      <SearchResults
        results={[]}
        isLoading
        isEmpty={false}
        hasSearched
        page={1}
        hasMore={false}
      />,
    );

    expect(
      screen.getByRole("status", { name: "Loading search results" }),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId("search-skeleton")).toHaveLength(3);
  });

  it("shows helpful empty state actions for zero results", () => {
    const onRetry = jest.fn();
    const onClearFilters = jest.fn();
    const onUseSuggestion = jest.fn();

    render(
      <SearchResults
        results={[]}
        isLoading={false}
        isEmpty
        hasSearched
        page={1}
        hasMore={false}
        hasActiveFilters
        onRetry={onRetry}
        onClearFilters={onClearFilters}
        onUseSuggestion={onUseSuggestion}
      />,
    );

    expect(screen.getByText("No confessions match your search.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry search" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    fireEvent.click(screen.getByRole("button", { name: 'Try "secret"' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onClearFilters).toHaveBeenCalledTimes(1);
    expect(onUseSuggestion).toHaveBeenCalledWith("secret");
  });

  it("keeps existing results visible with degraded retry UI", () => {
    const onRetry = jest.fn();

    render(
      <SearchResults
        results={[result]}
        query="searchable"
        isLoading={false}
        isEmpty={false}
        hasSearched
        page={1}
        hasMore={false}
        statusMeta={{
          partial: false,
          degraded: true,
          message: "Search service timed out",
          warnings: [],
          searchType: "error",
        }}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText("Search is in a degraded state")).toBeInTheDocument();
    expect(screen.getByTestId("search-result-item")).toHaveTextContent(
      "A searchable confession",
    );

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
