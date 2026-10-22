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

  it("falls back to the download link when an image fails to load", () => {
    render(
      <AttachmentPreview name="broken.webp" type="image/webp" url={SAFE_IMAGE_URL} />,
    );

    fireEvent.error(screen.getByRole("img", { name: "broken.webp" }));

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download broken.webp" })).toBeInTheDocument();
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
