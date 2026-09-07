"use client";

import { getCharacterCountWarning } from "@/app/lib/utils/validation";
import { cn } from "@/app/lib/utils/cn";

interface CharacterCounterProps {
  current: number;
  max: number;
  className?: string;
  id?: string;
}

export const CharacterCounter: React.FC<CharacterCounterProps> = ({
  current,
  max,
  className,
  id,
}) => {
  const warning = getCharacterCountWarning(current, max);
  const remaining = max - current;

  return (
    <div
      id={id}
      className={cn(
        "text-xs transition-colors",
        {
          "text-green-400": warning === "none",
          "text-yellow-400": warning === "warning",
          "text-red-400": warning === "error",
        },
        className
      )}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="sr-only">
        {remaining >= 0
          ? `${remaining} characters remaining`
          : `${Math.abs(remaining)} characters over limit`}
      </span>
      <span aria-hidden="true">
        {current} / {max} characters
        {warning === "warning" && " (approaching limit)"}
        {warning === "error" && " (limit reached)"}
      </span>
    </div>
  );
};
