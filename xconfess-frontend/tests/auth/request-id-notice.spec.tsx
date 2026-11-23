import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RequestIdNotice } from "@/app/components/auth/RequestIdNotice";

describe("RequestIdNotice", () => {
  it("renders nothing without a request id", () => {
    const { container } = render(<RequestIdNotice requestId={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a selectable request id and copies it on click", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<RequestIdNotice requestId="req-abc-123" />);

    const value = screen.getByTestId("auth-request-id");
    expect(value).toHaveTextContent("req-abc-123");
    // `select-all` keeps the id manually selectable as a fallback.
    expect(value).toHaveClass("select-all");

    await userEvent.click(screen.getByRole("button", { name: /copy request id/i }));
    expect(writeText).toHaveBeenCalledWith("req-abc-123");
    expect(await screen.findByText(/copied/i)).toBeInTheDocument();
  });
});
