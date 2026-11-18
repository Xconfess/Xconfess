import { axe, toHaveNoViolations } from "jest-axe";
import { render, screen } from "@testing-library/react";
import { BrandLogo } from "@/app/components/brand/BrandLogo";
import ProfileHeader from "@/app/components/profile/ProfileHeader";
import { ProfileHeader as DashboardProfileHeader } from "@/app/(dashboard)/profile/ProfileHeader";

expect.extend(toHaveNoViolations);

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img alt="" {...props} />,
}));

describe("remaining image alternative text", () => {
  it("avoids repeating the accessible name of the labeled brand link", async () => {
    const { container } = render(<BrandLogo />);

    expect(screen.getByRole("link", { name: "Go to xConfess home" })).toBeInTheDocument();
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("keeps a standalone brand image informative", async () => {
    const { container } = render(<BrandLogo href={null} />);

    expect(screen.getByRole("img", { name: "xConfess" })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("treats profile and badge images as decorative when their names are visible", async () => {
    const profile = {
      id: "profile-1",
      username: "alice",
      isAnonymous: false,
      avatarUrl: "/alice.png",
    };
    const { container, rerender } = render(<ProfileHeader profile={profile} />);

    expect(screen.getByRole("heading", { name: "alice" })).toBeInTheDocument();
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
    expect(await axe(container)).toHaveNoViolations();

    rerender(
      <DashboardProfileHeader
        username="alice"
        isAnonymous={false}
        joinDate="2024-01-01"
        badges={[{ id: "badge-1", name: "Contributor", description: "Contributor badge", iconUrl: "/badge.png" }]}
      />,
    );

    expect(screen.getByText("Contributor")).toBeInTheDocument();
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
    expect(await axe(container)).toHaveNoViolations();
  });
});