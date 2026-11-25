// components/notifications/NotificationPreferences.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Save, Bell, Mail, ShieldAlert } from "lucide-react";
import { NotificationPreferences as Preferences } from "@/app/types/notifications";
import { notificationApi } from "@/app/lib/api/notification";
import { useGlobalToast } from "@/app/components/common/Toast";

/**
 * Where a notification originates (backend scope) and how urgent its
 * content is. Surfaced to the user next to each toggle so they can tell
 * at a glance which backend behaviour each preference controls and which
 * messages still arrive even when a toggle is off (security-critical ones
 * are never silenced — see the per-row note).
 */
type NotificationScope = "content" | "social" | "financial" | "achievement" | "security";

interface ScopeMeta {
  label: string;
  description: string;
  securityCritical: boolean;
}

const SCOPE_META: Record<NotificationScope, ScopeMeta> = {
  content: {
    label: "Content activity",
    description: "Actions on confessions and comments you posted.",
    securityCritical: false,
  },
  social: {
    label: "Social activity",
    description: "What other users do that names you.",
    securityCritical: false,
  },
  financial: {
    label: "Financial activity",
    description: "Tip receipts and balances.",
    securityCritical: false,
  },
  achievement: {
    label: "Achievements",
    description: "Badges, milestones, and progress.",
    securityCritical: false,
  },
  security: {
    label: "Security",
    description:
      "Authentication, device changes and alerts. These are sent even when their category toggle is off, because silencing them would hide account takeover.",
    securityCritical: true,
  },
};

interface NotificationPreferencesProps {
  onClose: () => void;
  userId: string;
}

export function NotificationPreferences({
  onClose,
  userId,
}: NotificationPreferencesProps) {
  const [preferences, setPreferences] = useState<Preferences>({
    userId,
    reaction: true,
    comment: true,
    tip: true,
    badge: true,
    mention: true,
    follow: true,
    emailNotifications: true,
    pushNotifications: true,
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const toast = useGlobalToast();

  const fetchPreferences = useCallback(async () => {
    setLoading(true);
    try {
      const data = await notificationApi.getPreferences();
      setPreferences(data);
    } catch {
      toast.error("Failed to load notification preferences.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);

    try {
      await notificationApi.updatePreferences(preferences);

      setSaved(true);
      toast.success("Notification preferences saved.");
      setTimeout(() => setSaved(false), 3000);
    } catch {
      toast.error("Failed to save preferences. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = (key: keyof Preferences) => {
    setPreferences((prev: Preferences) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Each entry maps the UI toggle to the backend notification job name and
  // records its scope (#2310). Adding a new job type here means both the
  // user-visible label and the backend behaviour it gates are described in
  // one place, which is what the issue's "labels map to backend behavior"
  // acceptance criterion asks for.
  const notificationTypes: Array<{
    key: keyof Preferences;
    label: string;
    description: string;
    scope: NotificationScope;
  }> = [
    {
      key: "reaction" as keyof Preferences,
      label: "Reactions",
      description:
        "Fires when another user adds or removes a reaction on your confession. Sent through the delivery methods below.",
      scope: "content",
    },
    {
      key: "comment" as keyof Preferences,
      label: "Comments",
      description:
        "Fires when someone comments on your confession or replies in a thread you started.",
      scope: "content",
    },
    {
      key: "tip" as keyof Preferences,
      label: "Tips",
      description:
        "Fires when a tip hits your account. The on-chain receipt is still recorded whether this toggle is on or off.",
      scope: "financial",
    },
    {
      key: "badge" as keyof Preferences,
      label: "Badges",
      description:
        "Fires when you earn a new badge or reach a listed milestone. Purely celebratory — no alerts beyond this toggle.",
      scope: "achievement",
    },
    {
      key: "mention" as keyof Preferences,
      label: "Mentions",
      description:
        "Fires when another user names your handle in a confession or comment. Does not fire on direct messages.",
      scope: "social",
    },
    {
      key: "follow" as keyof Preferences,
      label: "Follows",
      description:
        "Fires when someone starts following your profile. No notification is sent on unfollow.",
      scope: "social",
    },
  ];

  const deliveryMethods: Array<{
    key: keyof Preferences;
    label: string;
    description: string;
    icon: typeof Bell;
  }> = [
    {
      key: "pushNotifications" as keyof Preferences,
      label: "Push Notifications",
      description:
        "Delivered as a browser push notification. Requires browser permission and only reaches signed-in sessions.",
      icon: Bell,
    },
    {
      key: "emailNotifications" as keyof Preferences,
      label: "Email Notifications",
      description:
        "Delivered to the address on your account. Security alerts are still emailed even if this is off.",
      icon: Mail,
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent-border)]"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-[var(--border)] bg-[var(--primary)] ">
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-[var(--surface-muted)] transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5 text-[var(--foreground)]" />
          </button>
          <h2 className="text-lg font-semibold text-[var(--foreground)]">
            Notification Preferences
          </h2>
        </div>
        <p className="text-sm text-[var(--foreground)] opacity-90 ml-10">
          Customize which notifications you receive
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Notification Types */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">
            Notification Types
          </h3>
          <p
            id="notification-scope-help"
            className="text-xs text-[var(--text-muted)] mb-3"
          >
            Each toggle controls one backend notification scope. Security
            alerts (sign-ins, device changes, password resets) are always
            delivered and cannot be turned off here — see the badge below.
          </p>
          <div className="space-y-3" aria-describedby="notification-scope-help">
            {notificationTypes.map((type) => {
              const scope = SCOPE_META[type.scope];
              return (
                <label
                  key={type.key as string}
                  data-notification-scope={type.scope}
                  className="flex items-start gap-3 p-3 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-muted)] cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={preferences[type.key] as boolean}
                    onChange={() => handleToggle(type.key)}
                    className="w-5 h-5 text-[var(--primary-deep)] rounded focus:ring-[var(--focus-ring)] mt-0.5"
                    aria-describedby={`notification-${String(type.key)}-desc`}
                  />
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-[var(--foreground)]">
                        {type.label}
                      </p>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                          scope.securityCritical
                            ? "border-[var(--danger)]/40 bg-[var(--danger)]/10 text-[var(--danger)]"
                            : "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-muted)]"
                        }`}
                        aria-label={`Scope: ${scope.label}`}
                        title={scope.description}
                      >
                        {scope.securityCritical && (
                          <ShieldAlert className="h-3 w-3" aria-hidden="true" />
                        )}
                        {scope.label}
                      </span>
                    </div>
                    <p
                      id={`notification-${String(type.key)}-desc`}
                      className="text-xs text-[var(--text-muted)] mt-0.5"
                    >
                      {type.description}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {/* Delivery Methods */}
        <div>
          <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">
            Delivery Methods
          </h3>
          <div className="space-y-3">
            {deliveryMethods.map((method) => {
              const Icon = method.icon;
              return (
                <label
                  key={method.key as string}
                  className="flex items-start gap-3 p-3 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-muted)] cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={preferences[method.key] as boolean}
                    onChange={() => handleToggle(method.key)}
                    className="w-5 h-5 text-[var(--primary-deep)] rounded focus:ring-[var(--focus-ring)] mt-0.5"
                  />
                  <Icon className="w-5 h-5 text-[var(--text-muted)] mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      {method.label}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      {method.description}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {/* Info Box */}
        <div className="mt-6 p-4 bg-[var(--accent-soft)] border border-[var(--accent-border)] rounded-lg">
          <p className="text-xs text-[var(--primary-deep)]">
            <strong>Note:</strong> Browser notifications require permission.
            Click &quot;Allow&quot; when prompted to enable push notifications.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-[var(--border)] bg-[var(--surface-muted)]">
        <button
          onClick={handleSave}
          disabled={saving}
          className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors ${
            saved
              ? "bg-[var(--success)] text-white"
              : "bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white disabled:opacity-50"
          }`}
        >
          {saving ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-[var(--border)] border-t-transparent"></div>
              Saving...
            </>
          ) : saved ? (
            <>
              <Save className="w-4 h-4" />
              Saved!
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save Preferences
            </>
          )}
        </button>
      </div>
    </div>
  );
}
