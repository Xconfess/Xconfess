import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ActivityTimeline } from "../ActiveTimeline";

function response(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as Response;
}

describe("ActivityTimeline tip history", () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue(
      response({ activities: [], hasMore: false }),
    );
  });

  it("shows accessible content-shaped skeletons while tip history loads", async () => {
    let resolveTips: ((result: Response) => void) | undefined;
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("type=tips")) {
        return new Promise<Response>((resolve) => {
          resolveTips = resolve;
        });
      }
      return Promise.resolve(response({ activities: [], hasMore: false }));
    });

    const { unmount } = render(<ActivityTimeline userId="user-1" />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Tips" }));

    expect(
      await screen.findByRole("status", { name: "Loading tip history" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("status", { hidden: true })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Tips" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    resolveTips?.(response({ activities: [], hasMore: false }));
    unmount();
  });

  it("shows the empty state after a successful empty response", async () => {
    render(<ActivityTimeline userId="user-1" />);
    await screen.findByText("No activity yet");
    fireEvent.click(screen.getByRole("button", { name: "Tips" }));

    expect(await screen.findByText("No activity yet")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a safe error and retries a failed tip history request", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(response({ activities: [], hasMore: false }))
      .mockRejectedValueOnce(new Error("private server detail"))
      .mockResolvedValueOnce(
        response({
          activities: [
            {
              id: "tip-1",
              type: "tip_received",
              timestamp: "2026-10-21T12:00:00.000Z",
              data: { description: "You received a tip" },
            },
          ],
          hasMore: false,
        }),
      );
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    render(<ActivityTimeline userId="user-1" />);
    await screen.findByText("No activity yet");
    fireEvent.click(screen.getByRole("button", { name: "Tips" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to load activity history. Please try again.",
    );
    expect(screen.queryByText("private server detail")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("You received a tip")).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
