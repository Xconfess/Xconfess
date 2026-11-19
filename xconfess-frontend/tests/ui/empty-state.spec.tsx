import { render, screen } from "@testing-library/react";
import { EmptyState } from "@/components/ui/empty-state";

describe("EmptyState", () => {
  it("renders the title with optional description and action", () => {
    render(
      <EmptyState
        title="No results"
        description="Try changing your search."
        action={<button>Clear search</button>}
      />,
    );

    expect(screen.getByRole("heading", { name: "No results" })).toBeInTheDocument();
    expect(screen.getByText("Try changing your search.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear search" })).toBeInTheDocument();
  });

  it("renders a title without optional content", () => {
    render(<EmptyState title="Nothing here" />);

    expect(screen.getByRole("heading", { name: "Nothing here" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
