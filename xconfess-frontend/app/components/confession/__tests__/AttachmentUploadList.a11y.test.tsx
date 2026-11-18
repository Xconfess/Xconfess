/**
 * @jest-environment jsdom
 */

import React from "react";
import { render } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { AttachmentUploadList } from "../AttachmentUploadList";
import type { PendingUpload } from "../../../lib/hooks/useAttachmentUpload";

expect.extend(toHaveNoViolations);

function makeUpload(overrides: Partial<PendingUpload> = {}): PendingUpload {
  return {
    id: "1",
    file: new File(["content"], "photo.png", { type: "image/png" }),
    status: "uploading",
    progress: 40,
    ...overrides,
  };
}

describe("AttachmentUploadList accessibility", () => {
  it("has no detectable accessibility violations while uploading", async () => {
    const { container } = render(
      <AttachmentUploadList
        uploads={[makeUpload()]}
        onCancel={jest.fn()}
        onRetry={jest.fn()}
      />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no detectable accessibility violations in an error state", async () => {
    const { container } = render(
      <AttachmentUploadList
        uploads={[makeUpload({ status: "error", error: "Upload failed (500)" })]}
        onCancel={jest.fn()}
        onRetry={jest.fn()}
      />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });

  it("renders nothing when there are no uploads", () => {
    const { container } = render(
      <AttachmentUploadList uploads={[]} onCancel={jest.fn()} onRetry={jest.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows progress and allows cancelling an in-progress upload", () => {
    const onCancel = jest.fn();
    const { getByRole } = render(
      <AttachmentUploadList
        uploads={[makeUpload()]}
        onCancel={onCancel}
        onRetry={jest.fn()}
      />,
    );

    const progressBar = getByRole("progressbar");
    expect(progressBar).toHaveAttribute("aria-valuenow", "40");

    getByRole("button", { name: /cancel upload of photo.png/i }).click();
    expect(onCancel).toHaveBeenCalledWith("1");
  });

  it("allows retrying a failed upload", () => {
    const onRetry = jest.fn();
    const { getByRole } = render(
      <AttachmentUploadList
        uploads={[makeUpload({ status: "error", error: "Upload failed (500)" })]}
        onCancel={jest.fn()}
        onRetry={onRetry}
      />,
    );

    getByRole("button", { name: /retry/i }).click();
    expect(onRetry).toHaveBeenCalledWith("1");
  });
});
