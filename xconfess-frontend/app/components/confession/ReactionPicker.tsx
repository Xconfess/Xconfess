"use client";

import { useCallback, useEffect, useRef } from "react";
import { ReactionButton } from "./ReactionButtons";
import type { ReactionType } from "@/app/lib/types/reaction";

interface ReactionTile {
  type: ReactionType;
  count: number;
  isActive?: boolean;
}

interface Props {
  confessionId: string;
  reactions: ReactionTile[];
  /** Accessible group name. Defaults to "Reactions". */
  label?: string;
  /** Called when the user asks to close/blur the picker (Escape). */
  onEscape?: () => void;
  className?: string;
}

/**
 * Keyboard-accessible wrapper around one or more {@link ReactionButton}s
 * (#2304). The group itself is a `toolbar`, and the inner buttons are its
 * focusable children. Keyboard behaviour:
 *
 * - `ArrowRight` / `ArrowDown`: move focus to the next reaction, wrapping.
 * - `ArrowLeft` / `ArrowUp`: move focus to the previous reaction, wrapping.
 * - `Home` / `End`: first / last reaction.
 * - `Escape`: blur the focused reaction and call `onEscape`.
 * - `Enter` / `Space`: already handled by the button itself.
 *
 * Selected state is preserved on each `ReactionButton` via `aria-pressed`
 * — no additional radio semantics, because a user can toggle multiple
 * reactions independently (like + love).
 *
 * The component never emits reactions on its own; it only wires keyboard
 * navigation. Clicks still go through `ReactionButton` so the optimistic
 * state, rate-limit toast, and websocket counters continue to work.
 */
export function ReactionPicker({
  confessionId,
  reactions,
  label = "Reactions",
  onEscape,
  className,
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  const buttons = useCallback((): HTMLButtonElement[] => {
    if (!rootRef.current) return [];
    return Array.from(
      rootRef.current.querySelectorAll<HTMLButtonElement>(
        'button[data-reaction-tile="true"]:not([disabled])',
      ),
    );
  }, []);

  const focusAt = useCallback(
    (index: number) => {
      const items = buttons();
      if (items.length === 0) return;
      const wrapped = ((index % items.length) + items.length) % items.length;
      items[wrapped].focus();
    },
    [buttons],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const items = buttons();
      if (items.length === 0) return;
      const currentIndex = items.findIndex(
        (el) => el === (document.activeElement as HTMLElement),
      );
      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown":
          event.preventDefault();
          focusAt(currentIndex < 0 ? 0 : currentIndex + 1);
          break;
        case "ArrowLeft":
        case "ArrowUp":
          event.preventDefault();
          focusAt(currentIndex < 0 ? items.length - 1 : currentIndex - 1);
          break;
        case "Home":
          event.preventDefault();
          focusAt(0);
          break;
        case "End":
          event.preventDefault();
          focusAt(items.length - 1);
          break;
        case "Escape":
          if (currentIndex >= 0) {
            event.preventDefault();
            items[currentIndex].blur();
            onEscape?.();
          }
          break;
        default:
          break;
      }
    },
    [buttons, focusAt, onEscape],
  );

  // If the picker loses every focusable child while something inside it was
  // focused (e.g. the only reaction became disabled), make sure focus does
  // not fall to the page body silently — move it to the group itself so a
  // screen reader still announces the location.
  useEffect(() => {
    if (!rootRef.current) return;
    const hasFocusedInside = rootRef.current.contains(document.activeElement);
    if (hasFocusedInside && buttons().length === 0) {
      rootRef.current.focus();
    }
  });

  return (
    <div
      ref={rootRef}
      role="toolbar"
      aria-label={label}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className={className}
      data-testid="reaction-picker"
    >
      <div className="flex gap-1.5">
        {reactions.map((r) => (
          <div key={r.type} data-reaction-tile-wrapper="true">
            <ReactionButtonSlot
              confessionId={confessionId}
              type={r.type}
              count={r.count}
              isActive={r.isActive}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Thin passthrough that stamps `data-reaction-tile="true"` on whatever the
 * underlying `ReactionButton` renders as its root button. Keeps the picker's
 * keyboard logic independent of the button's internal markup.
 */
function ReactionButtonSlot({
  confessionId,
  type,
  count,
  isActive,
}: {
  confessionId: string;
  type: ReactionType;
  count: number;
  isActive?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const btn = ref.current.querySelector("button");
    if (btn && !btn.hasAttribute("data-reaction-tile")) {
      btn.setAttribute("data-reaction-tile", "true");
    }
  });

  return (
    <div ref={ref}>
      <ReactionButton type={type} count={count} confessionId={confessionId} isActive={isActive} />
    </div>
  );
}

export default ReactionPicker;
