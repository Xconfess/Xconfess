import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/app/lib/utils/cn";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost" | "destructive";
  size?: "sm" | "md" | "lg";
  /** When true, renders a spinner and disables the button. */
  isLoading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", type = "button", isLoading, disabled, children, ...props }, ref) => {
    return (
      <button
        type={type}
        disabled={disabled || isLoading}
        aria-disabled={disabled || isLoading}
        className={cn(
          "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] font-medium transition-colors duration-150",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
          "disabled:pointer-events-none disabled:opacity-50",
          {
            "bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]":
              variant === "default",
            "border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-muted)]":
              variant === "outline",
            "text-[var(--secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]":
              variant === "ghost",
            "bg-[var(--danger)] text-white hover:opacity-90": variant === "destructive",
            "h-8 px-3 text-sm": size === "sm",
            "h-9 px-4 text-sm": size === "md",
            "h-10 px-5 text-sm": size === "lg",
          },
          className
        )}
        ref={ref}
        {...props}
      >
        {isLoading && <Loader2 className="animate-spin" size={16} aria-hidden="true" />}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button };
