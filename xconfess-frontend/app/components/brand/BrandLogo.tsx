"use client";

import Link from "next/link";
import Image from "next/image";
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
  horizontal: "/branding/new.png",
  full: "/branding/new.png",
  icon: "/branding/new.png",
} as const;

const logoSize = {
  horizontal: { width: 512, height: 512 },
  full: { width: 512, height: 512 },
  icon: { width: 512, height: 512 },
} as const;

export function BrandLogo({
  href = "/",
  variant = "horizontal",
  tone = "default",
  className,
  imageClassName,
  priority,
}: BrandLogoProps) {
  const src = logoSrc[variant];
  const size = logoSize[variant];

  const image = (
    <Image
      src={src}
      width={size.width}
      height={size.height}
      alt="xConfess"
      priority={priority}
      className={cn(
        "block h-auto max-w-full select-none",
        tone === "light" ? "brightness-100" : "",
        variant === "icon" ? "h-11 w-11 object-contain" : "h-12 w-[138px] object-contain sm:w-[156px]",
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
