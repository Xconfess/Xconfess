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
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        {
          "border-transparent bg-[var(--primary)] text-white":
            variant === "default",
          "border-transparent bg-[var(--surface-muted)] text-[var(--foreground)]":
            variant === "secondary",
          "border-[var(--border)] text-[var(--foreground)]":
            variant === "outline",
          "border-transparent bg-red-600 text-white":
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
