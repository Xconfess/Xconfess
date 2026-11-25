/**
 * @jest-environment jsdom
 */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { AttachmentPreview } from "../AttachmentPreview";

expect.extend(toHaveNoViolations);

const SAFE_IMAGE_URL = "https://cdn.example.com/photo.png";

describe("AttachmentPreview", () => {
  it("renders an allow-listed image inline with its name as alt text", () => {
    render(
      <AttachmentPreview name="photo.png" type="image/png" size={2048} url={SAFE_IMAGE_URL} />,
    );

    const image = screen.getByRole("img", { name: "photo.png" });
    expect(image).toHaveAttribute("src", SAFE_IMAGE_URL);
    expect(screen.getByRole("link", { name: "Download photo.png" })).toHaveAttribute(
      "href",
      SAFE_IMAGE_URL,
    );
  });

  it("shows an explicit retry affordance when the image fails to load, distinct from an upload error", () => {
    render(
      <AttachmentPreview name="broken.webp" type="image/webp" url={SAFE_IMAGE_URL} />,
    );

    fireEvent.error(screen.getByRole("img", { name: "broken.webp" }));

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByTestId("attachment-preview-error")).toHaveAccessibleName(
      /preview failed for broken\.webp/i,
    );
    expect(
      screen.getByRole("button", { name: /retry loading preview for broken\.webp/i }),
    ).toBeInTheDocument();
    // The download link stays available so the user is never fully stuck.
    expect(
      screen.getByRole("link", { name: "Download broken.webp" }),
    ).toBeInTheDocument();
    // Copy explicitly separates preview failure from upload failure so the
    // user understands retrying does not re-upload the file.
    expect(
      screen.getByText(/the file was uploaded successfully/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/won't re-upload the file/i),
    ).toBeInTheDocument();
  });

  it("re-renders the image when the retry button is clicked and busts the cached URL", () => {
    render(
      <AttachmentPreview name="broken.webp" type="image/webp" url={SAFE_IMAGE_URL} />,
    );

    fireEvent.error(screen.getByRole("img", { name: "broken.webp" }));

    fireEvent.click(
      screen.getByRole("button", { name: /retry loading preview for broken\.webp/i }),
    );

    const retried = screen.getByRole("img", { name: "broken.webp" });
    expect(retried).toHaveAttribute("src", expect.stringContaining(SAFE_IMAGE_URL));
    expect(retried.getAttribute("src")).toMatch(/__preview_retry=1$/);
  });

  it("does not render the retry affordance for non-image attachments", () => {
    render(
      <AttachmentPreview name="report.pdf" type="application/pdf" url={SAFE_IMAGE_URL} />,
    );

    expect(screen.queryByTestId("attachment-preview-error")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /retry loading preview/i }),
    ).not.toBeInTheDocument();
  });

  it("never renders a PDF inline and offers a labelled download", () => {
    const { container } = render(
      <AttachmentPreview name="report.pdf" type="application/pdf" size={5000} url={SAFE_IMAGE_URL} />,
    );

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(container.querySelector("iframe, object, embed")).toBeNull();
    expect(screen.getByRole("link", { name: "Download report.pdf" })).toBeInTheDocument();
    expect(screen.getByText("application/pdf · 4.88 KB")).toBeInTheDocument();
  });

  it("keeps malicious extensions and filenames inert", () => {
    const maliciousName = '<img src=x onerror=alert(1)>.svg';
    const { container } = render(
      <AttachmentPreview name={maliciousName} type="image/png" url={SAFE_IMAGE_URL} />,
    );

    expect(screen.getByText(maliciousName)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg, script")).toBeNull();
    expect(screen.getByRole("link")).toHaveAttribute("download", maliciousName);
  });

  it("shows a generic label for an unknown MIME type", () => {
    render(<AttachmentPreview name="mystery" type="" url={SAFE_IMAGE_URL} />);

    expect(screen.getByText("Unknown file type")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download mystery" })).toBeInTheDocument();
  });

  it("does not render an unsafe URL as a link", () => {
    render(
      <AttachmentPreview name="evil.png" type="image/png" url="javascript:alert(1)" />,
    );

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("Preview unavailable")).toBeInTheDocument();
  });

  it("shows preview unavailable when no URL is provided", () => {
    render(<AttachmentPreview name="notes.txt" type="text/plain" />);

    expect(screen.getByText("Preview unavailable")).toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(
      <AttachmentPreview name="photo.png" type="image/png" url={SAFE_IMAGE_URL} />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
