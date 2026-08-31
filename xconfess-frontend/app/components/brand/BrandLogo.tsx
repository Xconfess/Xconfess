"use client";

import Link from "next/link";
import { cn } from "@/app/lib/utils/cn";

type BrandLogoProps = {
  href?: string | null;
  variant?: "horizontal" | "full" | "icon";
  tone?: "default" | "light";
  className?: string;
  imageClassName?: string;
  priority?: boolean;
};

const logoSrc = {
  horizontal: "/branding/logo-horizontal.svg",
  full: "/branding/logo-full.svg",
  icon: "/branding/xconfess-icon.svg",
} as const;

const logoSize = {
  horizontal: { width: 180, height: 45 },
  full: { width: 190, height: 75 },
  icon: { width: 44, height: 44 },
} as const;

export function BrandLogo({
  href = "/",
  variant = "horizontal",
  tone = "default",
  className,
  imageClassName,
  priority,
}: BrandLogoProps) {
  const src =
    tone === "light" && variant === "horizontal"
      ? "/branding/logo-white.svg"
      : logoSrc[variant];
  const size = logoSize[variant];

  const image = (
    <img
      src={src}
      width={size.width}
      height={size.height}
      alt="xConfess"
      decoding="async"
      fetchPriority={priority ? "high" : undefined}
      className={cn(
        "block h-auto max-w-full select-none",
        variant === "icon" ? "w-11" : "w-[150px] sm:w-[172px]",
        imageClassName,
      )}
    />
  );

  if (!href) {
    return <div className={className}>{image}</div>;
  }

  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand-violet)]",
        className,
      )}
      aria-label="Go to xConfess home"
    >
      {image}
    </Link>
  );
}
