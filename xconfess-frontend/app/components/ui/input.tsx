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
          "flex w-full rounded-xl border bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--foreground)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
          "placeholder:text-[color:rgba(169,160,149,0.7)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          "focus-visible:ring-[var(--primary)] focus-visible:ring-offset-[var(--background)] disabled:cursor-not-allowed disabled:opacity-50",
          error
            ? "border-red-500 focus-visible:ring-red-500"
            : "border-[var(--border)] focus-visible:border-[var(--primary)]",
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
