import { render, screen } from "@testing-library/react";
import {
  ThreadListEmptyState,
  ThreadMessagesEmptyState,
} from "../MessagesEmptyState";

describe("messages empty states", () => {
  test("thread list first-use copy is a heading inside a status region", () => {
    render(<ThreadListEmptyState />);

    expect(
      screen.getByRole("heading", { name: "No messages yet" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "conversations will appear here",
    );
  });

  test("open thread copy explains how to start the conversation", () => {
    render(<ThreadMessagesEmptyState />);

    expect(
      screen.getByRole("heading", { name: "No messages in this thread yet" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Send a message below to start the conversation."),
    ).toBeInTheDocument();
  });
});
