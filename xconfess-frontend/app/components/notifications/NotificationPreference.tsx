// components/notifications/NotificationPreferences.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Save, Bell, Mail } from "lucide-react";
import { NotificationPreferences as Preferences } from "@/app/types/notifications";
import { notificationApi } from "@/app/lib/api/notification";
import { useGlobalToast } from "@/app/components/common/Toast";

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

  const notificationTypes = [
    {
      key: "reaction" as keyof Preferences,
      label: "Reactions",
      description: "When someone reacts to your confession",
    },
    {
      key: "comment" as keyof Preferences,
      label: "Comments",
      description: "When someone comments on your confession",
    },
    {
      key: "tip" as keyof Preferences,
      label: "Tips",
      description: "When someone sends you a tip",
    },
    {
      key: "badge" as keyof Preferences,
      label: "Badges",
      description: "When you earn a new badge",
    },
    {
      key: "mention" as keyof Preferences,
      label: "Mentions",
      description: "When someone mentions you",
    },
    {
      key: "follow" as keyof Preferences,
      label: "Follows",
      description: "When someone follows you",
    },
  ];

  const deliveryMethods = [
    {
      key: "pushNotifications" as keyof Preferences,
      label: "Push Notifications",
      description: "Receive in-app push notifications",
      icon: Bell,
    },
    {
      key: "emailNotifications" as keyof Preferences,
      label: "Email Notifications",
      description: "Receive notifications via email",
      icon: Mail,
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-linear-to-r from-blue-500 to-purple-600">
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-white/20 transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <h2 className="text-lg font-semibold text-white">
            Notification Preferences
          </h2>
        </div>
        <p className="text-sm text-white opacity-90 ml-10">
          Customize which notifications you receive
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Notification Types */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            Notification Types
          </h3>
          <div className="space-y-3">
            {notificationTypes.map((type) => (
              <label
                key={type.key as string}
                className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={preferences[type.key] as boolean}
                  onChange={() => handleToggle(type.key)}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 mt-0.5"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {type.label}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {type.description}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Delivery Methods */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            Delivery Methods
          </h3>
          <div className="space-y-3">
            {deliveryMethods.map((method) => {
              const Icon = method.icon;
              return (
                <label
                  key={method.key as string}
                  className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={preferences[method.key] as boolean}
                    onChange={() => handleToggle(method.key)}
                    className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 mt-0.5"
                  />
                  <Icon className="w-5 h-5 text-gray-500 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {method.label}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {method.description}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {/* Info Box */}
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-xs text-blue-800">
            <strong>Note:</strong> Browser notifications require permission.
            Click &quot;Allow&quot; when prompted to enable push notifications.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <button
          onClick={handleSave}
          disabled={saving}
          className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors ${
            saved
              ? "bg-green-600 text-white"
              : "bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
          }`}
        >
          {saving ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
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
