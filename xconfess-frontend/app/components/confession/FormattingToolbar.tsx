"use client";

import { useState, useRef, useEffect } from "react";
import { Bold, Italic, Link, Smile } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Modal } from "@/app/components/ui/modal";
import { Input } from "@/app/components/ui/input";
import {
  insertBold,
  insertItalic,
  insertLink,
  insertEmoji,
} from "@/app/lib/utils/markdown";

interface FormattingToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onTextChange?: (newText: string, cursorPos: number) => void;
}

const COMMON_EMOJIS = [
  "😀",
  "😂",
  "❤️",
  "😢",
  "🤯",
  "😊",
  "😍",
  "🤔",
  "👍",
  "👎",
  "🔥",
  "💯",
  "✨",
  "🎉",
  "🙏",
  "💪",
];

export const FormattingToolbar: React.FC<FormattingToolbarProps> = ({
  textareaRef,
  onTextChange,
}) => {
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);

  // Handle outside clicks and Escape key to close the emoji picker popover
  useEffect(() => {
    if (!isEmojiPickerOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setIsEmojiPickerOpen(false);
        emojiButtonRef.current?.focus();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (
        emojiPickerRef.current &&
        !emojiPickerRef.current.contains(e.target as Node) &&
        emojiButtonRef.current &&
        !emojiButtonRef.current.contains(e.target as Node)
      ) {
        setIsEmojiPickerOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isEmojiPickerOpen]);

  const handleBold = () => {
    if (textareaRef.current) {
      const { newText, cursorPos } = insertBold(textareaRef.current);
      if (onTextChange) {
        onTextChange(newText, cursorPos);
      }
    }
  };

  const handleItalic = () => {
    if (textareaRef.current) {
      const { newText, cursorPos } = insertItalic(textareaRef.current);
      if (onTextChange) {
        onTextChange(newText, cursorPos);
      }
    }
  };

  const handleLink = () => {
    setIsLinkModalOpen(true);
  };

  const handleInsertLink = () => {
    if (textareaRef.current) {
      const { newText, cursorPos } = insertLink(
        textareaRef.current,
        linkUrl || undefined,
      );
      if (onTextChange) {
        onTextChange(newText, cursorPos);
      }
      setLinkUrl("");
      setIsLinkModalOpen(false);
    }
  };

  const handleEmojiClick = (emoji: string) => {
    if (textareaRef.current) {
      const { newText, cursorPos } = insertEmoji(textareaRef.current, emoji);
      if (onTextChange) {
        onTextChange(newText, cursorPos);
      }
    }
    setIsEmojiPickerOpen(false);
    emojiButtonRef.current?.focus();
  };

  return (
    <>
      <div
        className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1 overflow-x-auto"
        role="toolbar"
        aria-label="Text formatting"
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleBold}
          aria-label="Bold"
          title="Bold (Ctrl+B)"
          className="h-8 w-8 p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <Bold className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleItalic}
          aria-label="Italic"
          title="Italic (Ctrl+I)"
          className="h-8 w-8 p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <Italic className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleLink}
          aria-label="Insert link"
          title="Insert link"
          className="h-8 w-8 p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <Link className="h-4 w-4" aria-hidden="true" />
        </Button>
        <div className="relative">
          <Button
            ref={emojiButtonRef}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsEmojiPickerOpen(!isEmojiPickerOpen)}
            aria-label="Insert emoji"
            aria-expanded={isEmojiPickerOpen}
            aria-haspopup="true"
            title="Insert emoji"
            className="h-8 w-8 p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Smile className="h-4 w-4" aria-hidden="true" />
          </Button>
          {isEmojiPickerOpen && (
            <div
              ref={emojiPickerRef}
              className="absolute left-0 top-full z-50 mt-2 rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-2 shadow-xl"
              role="region"
              aria-label="Emoji picker"
            >
              <div className="grid grid-cols-8 gap-1">
                {COMMON_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => handleEmojiClick(emoji)}
                    className="rounded p-1 text-lg hover:bg-[var(--surface-muted)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    aria-label={`Insert ${emoji} emoji`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={isLinkModalOpen}
        onClose={() => {
          setIsLinkModalOpen(false);
          setLinkUrl("");
        }}
        title="Insert Link"
      >
        <div className="space-y-4">
          <div>
            <label
              htmlFor="link-url"
              className="block text-sm font-medium text-[var(--foreground)] mb-2"
            >
              URL
            </label>
            <Input
              id="link-url"
              type="url"
              placeholder="https://example.com"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleInsertLink();
                }
              }}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsLinkModalOpen(false);
                setLinkUrl("");
              }}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleInsertLink}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Insert Link
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};