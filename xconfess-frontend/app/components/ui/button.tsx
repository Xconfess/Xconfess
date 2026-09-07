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
          "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          "focus-visible:ring-[var(--primary)] focus-visible:ring-offset-[var(--background)] disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
          {
            "border border-[var(--accent-border)] bg-[image:var(--brand-gradient)] text-white shadow-[0_18px_42px_-22px_rgba(0,0,0,0.85)] hover:-translate-y-0.5 hover:brightness-110":
              variant === "default",
            "border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-strong)]":
              variant === "outline",
            "text-[var(--secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]":
              variant === "ghost",
            "bg-red-600 text-white hover:bg-red-700": variant === "destructive",
            "h-9 px-4 text-sm": size === "sm",
            "h-11 px-5 text-[15px]": size === "md",
            "h-12 px-7 text-base": size === "lg",
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
