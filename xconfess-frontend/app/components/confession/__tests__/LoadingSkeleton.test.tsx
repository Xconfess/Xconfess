import { render, screen } from "@testing-library/react";
import {
  CommentSectionSkeleton,
  ConfessionDetailSkeleton,
  ConfessionFeedSkeleton,
} from "@/app/components/confession/LoadingSkeleton";

describe("confession loading skeletons", () => {
  it("exposes an accessible loading region for the confession feed", () => {
    render(<ConfessionFeedSkeleton />);

    expect(
      screen.getByRole("status", { name: "Loading confessions" }),
    ).toBeInTheDocument();
  });

  it("exposes an accessible loading region for comments", () => {
    render(<CommentSectionSkeleton />);

    expect(
      screen.getByRole("status", { name: "Loading comments" }),
    ).toBeInTheDocument();
  });

  it("exposes an accessible loading region for the confession detail view", () => {
    render(<ConfessionDetailSkeleton />);

    expect(
      screen.getByRole("status", { name: "Loading confession details" }),
    ).toBeInTheDocument();
  });
});
