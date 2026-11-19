'use client';

import * as React from 'react';
import { Send, Trash2, WifiOff, Wifi } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export interface MessageComposerProps {
  /** Current (unsent) text for the active conversation. */
  value: string;
  /** Called on every keystroke so the caller can persist the draft. */
  onChange: (value: string) => void;
  /** Called when the user asks to send the message. */
  onSend: () => void;
  /** Called when the user explicitly throws the draft away. */
  onDiscard?: () => void;
  /** True when the active conversation holds an unsent draft. */
  hasDraft?: boolean;
  disabled?: boolean;
  isSending?: boolean;
  /**
   * When true, the device (or the app's connection to the backend) is
   * offline. Sending is blocked, the field is disabled, and the user is told
   * their draft is safe. Transitioning back to online shows a brief
   * reconnect confirmation. Defaults to false (assume online).
   */
  isOffline?: boolean;
  /**
   * Minimum length of the draft, in trimmed characters, that triggers the
   * discard-confirmation prompt (#2309). Discards below this threshold are
   * fired directly through `onDiscard`. Set to `0` to always confirm; set
   * to `Infinity` to never confirm. Defaults to {@link DEFAULT_DISCARD_CONFIRM_THRESHOLD}.
   */
  discardConfirmThreshold?: number;
  placeholder: string;
  /** Accessible name for the text field. */
  label: string;
  inputRef?: React.Ref<HTMLInputElement>;
  className?: string;
}

const RECONNECT_CONFIRMATION_MS = 3000;
/**
 * Chars above which discarding a draft asks for confirmation (#2309). A
 * short draft is usually a typo the user wants gone; a substantial draft
 * is private content the user likely did not mean to lose, so the discard
 * control gates on a short prompt instead of firing through.
 */
export const DEFAULT_DISCARD_CONFIRM_THRESHOLD = 140;

/**
 * The inbox composer.
 *
 * The text is owned by the caller (the inbox keeps one draft per
 * conversation), so switching conversations swaps the value in place without
 * losing whatever the user had typed for the conversation being left.
 *
 * The composer is purely presentational — it never performs network I/O or
 * decides when a send has succeeded. When `isOffline` is true the composer
 * refuses to fire `onSend` at all, so a user can never see a "message sent"
 * state while disconnected (prevents false success). Retry safety lives in
 * the caller: pair every `onSend` with an idempotency key so a manual retry
 * after reconnect never produces a duplicate message server-side.
 */
export function MessageComposer({
  value,
  onChange,
  onSend,
  onDiscard,
  hasDraft = false,
  disabled = false,
  isSending = false,
  isOffline = false,
  discardConfirmThreshold = DEFAULT_DISCARD_CONFIRM_THRESHOLD,
  placeholder,
  label,
  inputRef,
  className,
}: MessageComposerProps) {
  const canSend =
    !disabled && !isSending && !isOffline && value.trim().length > 0;

  const [pendingDiscard, setPendingDiscard] = React.useState(false);

  const handleDiscardClick = () => {
    if (!onDiscard) return;
    if (value.trim().length >= discardConfirmThreshold) {
      setPendingDiscard(true);
      return;
    }
    onDiscard();
  };

  const confirmDiscard = () => {
    setPendingDiscard(false);
    onDiscard?.();
  };

  const cancelDiscard = () => {
    setPendingDiscard(false);
  };

  // Dismiss on Escape — a mis-clicked trash button must never destroy a
  // long draft just because the user hit any key while the prompt is open.
  React.useEffect(() => {
    if (!pendingDiscard) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setPendingDiscard(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingDiscard]);

  // Remember whether the composer was offline on the previous render so the
  // transition offline -> online can briefly show a reassurance that the
  // connection is back, without reusing the offline banner slot.
  const wasOfflineRef = React.useRef(isOffline);
  const [showReconnected, setShowReconnected] = React.useState(false);

  React.useEffect(() => {
    if (wasOfflineRef.current && !isOffline) {
      setShowReconnected(true);
      const timer = setTimeout(
        () => setShowReconnected(false),
        RECONNECT_CONFIRMATION_MS,
      );
      wasOfflineRef.current = isOffline;
      return () => clearTimeout(timer);
    }
    wasOfflineRef.current = isOffline;
  }, [isOffline]);

  return (
    <div className={className}>
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        {hasDraft && onDiscard && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleDiscardClick}
            disabled={disabled || isSending}
            aria-label="Discard unsent message"
            title="Discard unsent message"
            className="shrink-0 text-[var(--text-muted)] hover:text-[var(--danger)]"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
        <Input
          ref={inputRef}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && canSend) {
              event.preventDefault();
              onSend();
            }
          }}
          disabled={disabled || isSending || isOffline}
          aria-label={label}
          className="min-w-0 flex-1 text-sm"
        />
        <Button
          type="button"
          className="shrink-0"
          onClick={onSend}
          disabled={!canSend}
          aria-label="Send message"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      {isOffline && (
        <p
          role="status"
          aria-live="polite"
          data-testid="composer-offline-status"
          className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[var(--warning)]"
        >
          <WifiOff className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span>
            Offline — your message can&apos;t be sent right now. The draft is
            saved and will be here when you reconnect.
          </span>
        </p>
      )}
      {!isOffline && showReconnected && (
        <p
          role="status"
          aria-live="polite"
          data-testid="composer-reconnected-status"
          className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[var(--success)]"
        >
          <Wifi className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span>Back online. You can send your message now.</span>
        </p>
      )}
      {hasDraft && !isOffline && !showReconnected && !pendingDiscard && (
        <p
          role="status"
          aria-live="polite"
          className="mt-1.5 text-[11px] text-[var(--text-muted)]"
        >
          Draft saved for this conversation.
        </p>
      )}
      {pendingDiscard && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="composer-discard-title"
          aria-describedby="composer-discard-body"
          data-testid="composer-discard-confirm"
          className="mt-2 rounded-lg border border-[var(--warning)]/40 bg-[var(--surface)] p-3 shadow-sm"
        >
          <p
            id="composer-discard-title"
            className="text-sm font-semibold text-[var(--foreground)]"
          >
            Discard this draft?
          </p>
          <p
            id="composer-discard-body"
            className="mt-1 text-xs text-[var(--text-muted)]"
          >
            This message is {value.trim().length} characters long. Discarding
            it can&apos;t be undone — the draft will be erased for this
            conversation.
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={cancelDiscard}
              aria-label="Keep draft"
              autoFocus
            >
              Keep draft
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={confirmDiscard}
              aria-label="Discard draft permanently"
            >
              Discard draft
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default MessageComposer;
