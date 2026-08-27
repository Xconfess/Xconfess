"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/app/lib/utils/cn";

export interface CheckboxProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "checked" | "onChange" | "type"
  > {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked = false, onCheckedChange, disabled, ...props }, ref) => (
    <span className="relative inline-flex h-4 w-4 items-center justify-center">
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onCheckedChange?.(event.target.checked)}
        className={cn(
          "peer h-4 w-4 cursor-pointer appearance-none rounded border border-[var(--border)] bg-[var(--surface)]",
          "transition-colors checked:border-[var(--primary)] checked:bg-[var(--primary)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
      <Check className="pointer-events-none absolute h-3 w-3 text-white opacity-0 peer-checked:opacity-100" />
    </span>
  ),
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
