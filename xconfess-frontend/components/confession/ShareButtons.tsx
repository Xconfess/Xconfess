"use client";

import { useState } from "react";
import { Share2, Twitter, Facebook, Link2, Check } from "lucide-react";

interface ShareButtonsProps {
  confessionId: string;
  content: string;
}

export function ShareButtons({ confessionId, content }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false);
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/confessions/${confessionId}`
      : "";

  const shareText = content.slice(0, 100) + (content.length > 100 ? "..." : "");

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleTwitterShare = () => {
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}`;
    window.open(twitterUrl, "_blank", "width=600,height=400");
  };

  const handleFacebookShare = () => {
    const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
    window.open(facebookUrl, "_blank", "width=600,height=400");
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleTwitterShare}
        className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-md bg-blue-500 text-white hover:bg-blue-600 transition"
        title="Share on Twitter"
      >
        <Twitter className="w-4 h-4" />
        <span className="hidden sm:inline">Twitter</span>
      </button>

      <button
        onClick={handleFacebookShare}
        className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 transition"
        title="Share on Facebook"
      >
        <Facebook className="w-4 h-4" />
        <span className="hidden sm:inline">Facebook</span>
      </button>

      <button
        onClick={handleCopyLink}
        className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-md bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition"
        title="Copy link"
      >
        {copied ? (
          <>
            <Check className="w-4 h-4" />
            <span className="hidden sm:inline">Copied!</span>
          </>
        ) : (
          <>
            <Link2 className="w-4 h-4" />
            <span className="hidden sm:inline">Copy Link</span>
          </>
        )}
      </button>
    </div>
  );
}
