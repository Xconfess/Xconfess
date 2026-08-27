import { render, screen } from "@testing-library/react";
import { AnalyticsLoadingSkeleton } from "@/app/components/analytics/LoadingState";

describe("AnalyticsLoadingSkeleton", () => {
  it("announces the analytics dashboard loading state", () => {
    render(<AnalyticsLoadingSkeleton />);

    expect(
      screen.getByRole("status", { name: "Loading analytics dashboard" }),
    ).toBeInTheDocument();
  });
});
