"use client";

import { Notification } from "@/app/types/notifications";
import { Trash2, Check } from "lucide-react";

interface NotificationItemProps {
    notification: Notification;
    onMarkAsRead: (id: string) => void;
    onDelete: (id: string) => void;
}

export function NotificationItem({
    notification,
    onMarkAsRead,
    onDelete,
}: NotificationItemProps) {
    return (
        <div
            className={`p-3 sm:p-4 flex justify-between gap-2 sm:gap-3 ${notification.isRead ? "bg-[var(--surface)]" : "bg-[var(--accent-soft)]"
                }`}
        >
            <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-medium text-[var(--foreground)]">
                    {notification.title}
                </p>
                <p className="break-words text-xs text-[var(--secondary)]">{notification.message}</p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
                {!notification.isRead && (
                    <button
                        onClick={() => onMarkAsRead(notification.id)}
                        aria-label="Mark as read"
                    >
                        <Check className="w-4 h-4 text-[var(--success)]" />
                    </button>
                )}

                <button
                    onClick={() => onDelete(notification.id)}
                    aria-label="Delete notification"
                >
                    <Trash2 className="w-4 h-4 text-[var(--danger)]" />
                </button>
            </div>
        </div>
    );
}
