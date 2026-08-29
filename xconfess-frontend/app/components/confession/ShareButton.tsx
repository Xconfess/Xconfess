"use client";

import { useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Share2, Copy, Check, Mail } from "lucide-react";
import { cn } from "@/app/lib/utils/cn";

interface ShareButtonProps {
  confessionId: string;
  title?: string;
  className?: string;
  variant?: "button" | "dropdown";
}

export function ShareButton({
  confessionId,
  title = "Share confession",
  className,
  variant = "button",
}: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  const baseUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL || "";
  const shareUrl = `${baseUrl}/confessions/${confessionId}`;
  const shareText = encodeURIComponent(
    title ? `${title} — xConfess` : "Check out this confession on xConfess"
  );

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = shareUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
    setOpen(false);
  };

  const shareViaEmail = () => {
    const mailto = `mailto:?subject=${shareText}&body=${encodeURIComponent(shareUrl)}`;
    window.open(mailto);
    setOpen(false);
  };

  const shareToTwitter = () => {
    const url = `https://twitter.com/intent/tweet?text=${shareText}&url=${encodeURIComponent(shareUrl)}`;
    window.open(url, "_blank", "noopener,noreferrer,width=550,height=420");
    setOpen(false);
  };

  const shareNative = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: title || "xConfess",
          text: shareText,
          url: shareUrl,
        });
      } catch (err) {
        if ((err as Error).name !== "AbortError") copyLink();
      }
    } else {
      copyLink();
    }
    setOpen(false);
  };

  if (variant === "dropdown") {
    return (
      <div className={cn("relative", className)}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen((o) => !o)}
          className="gap-2"
          aria-label="Share options"
        >
          <Share2 className="h-4 w-4" />
          Share
        </Button>
        {open && (
          <>
            <div
              className="fixed inset-0 z-10"
              aria-hidden
              onClick={() => setOpen(false)}
            />
            <div
              className="absolute right-0 top-full z-20 mt-1 min-w-[180px] rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl"
              role="menu"
            >
              <button
                type="button"
                onClick={copyLink}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
                role="menuitem"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-400" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {copied ? "Copied!" : "Copy link"}
              </button>
              {typeof navigator !== "undefined" && "share" in navigator && (
                <button
                  type="button"
                  onClick={shareNative}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
                  role="menuitem"
                >
                  <Share2 className="h-4 w-4" />
                  Share via...
                </button>
              )}
              <button
                type="button"
                onClick={shareToTwitter}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
                role="menuitem"
              >
                Share to X
              </button>
              <button
                type="button"
                onClick={shareViaEmail}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
                role="menuitem"
              >
                <Mail className="h-4 w-4" />
                Email
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Button
        variant="outline"
        size="sm"
        onClick={shareNative}
        className="gap-2"
        aria-label="Share"
      >
        <Share2 className="h-4 w-4" />
        Share
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={copyLink}
        className="gap-2"
        aria-label="Copy link"
      >
        {copied ? (
          <Check className="h-4 w-4 text-green-400" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
        {copied ? "Copied" : "Copy link"}
      </Button>
    </div>
  );
}
