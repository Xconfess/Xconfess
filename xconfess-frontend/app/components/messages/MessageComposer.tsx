'use client';

import * as React from 'react';
import { Send, Trash2 } from 'lucide-react';
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
  placeholder: string;
  /** Accessible name for the text field. */
  label: string;
  inputRef?: React.Ref<HTMLInputElement>;
  className?: string;
}

/**
 * The inbox composer.
 *
 * The text is owned by the caller (the inbox keeps one draft per
 * conversation), so switching conversations swaps the value in place without
 * losing whatever the user had typed for the conversation being left.
 */
export function MessageComposer({
  value,
  onChange,
  onSend,
  onDiscard,
  hasDraft = false,
  disabled = false,
  isSending = false,
  placeholder,
  label,
  inputRef,
  className,
}: MessageComposerProps) {
  const canSend = !disabled && !isSending && value.trim().length > 0;

  return (
    <div className={className}>
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        {hasDraft && onDiscard && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDiscard}
            disabled={disabled || isSending}
            aria-label="Discard unsent message"
            title="Discard unsent message"
            className="shrink-0 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
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
          disabled={disabled || isSending}
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
      {hasDraft && (
        <p
          role="status"
          aria-live="polite"
          className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400"
        >
          Draft saved for this conversation.
        </p>
      )}
    </div>
  );
}

export default MessageComposer;
