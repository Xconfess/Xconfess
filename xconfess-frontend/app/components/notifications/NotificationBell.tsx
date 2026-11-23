"use client";

import React, { useState, useRef, useEffect } from "react";
import { Bell } from "lucide-react";
import { NotificationCenter } from "./NotificationCenter";
import { useNotifications } from "@/app/lib/hooks/useNotifications";

interface NotificationBellProps {
  userId?: string;
  className?: string;
}

export function NotificationBell({
  userId = "current-user-id",
  className = "",
}: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { unreadCount } = useNotifications(userId);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className={`relative inline-block ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-[var(--secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={isOpen}
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            data-testid="notification-badge"
            className="absolute top-1 right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-sm"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-12 z-50 animate-in fade-in zoom-in-95 duration-150">
          <NotificationCenter onClose={() => setIsOpen(false)} />
        </div>
      )}
    </div>
  );
}
