import * as React from "react";
import { cn } from "@/app/lib/utils/cn";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "secondary" | "outline" | "destructive";
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "default", ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        {
          "border-transparent bg-[var(--accent-soft)] text-[var(--primary-deep)]":
            variant === "default",
          "border-transparent bg-[var(--surface-muted)] text-[var(--foreground)]":
            variant === "secondary",
          "border-[var(--border)] text-[var(--secondary)]":
            variant === "outline",
          "border-transparent bg-[var(--danger)]/15 text-[var(--danger)]":
            variant === "destructive",
        },
        className,
      )}
      {...props}
    />
  ),
);
Badge.displayName = "Badge";

export { Badge };
