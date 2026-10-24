import * as React from "react";
import { cn } from "@/app/lib/utils/cn";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <input
        aria-invalid={error ? "true" : "false"}
        className={cn(
          "flex h-9 w-full rounded-[var(--radius-control)] border bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--foreground)] transition-colors",
          "placeholder:text-[var(--text-muted)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]/40 disabled:cursor-not-allowed disabled:opacity-50",
          error
            ? "border-[var(--danger)] focus-visible:border-[var(--danger)]"
            : "border-[var(--border)] focus-visible:border-[var(--focus-ring)]",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
