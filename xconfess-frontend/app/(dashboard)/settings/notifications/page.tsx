"use client";

import React, { useEffect, useState } from 'react';
import { Bell, Mail, Smartphone, Moon, Save, Clock, RefreshCw } from 'lucide-react';
import { useGlobalToast } from '@/app/components/common/Toast';
import { normalizeApiError } from '@/app/lib/api/errors';

interface ChannelPrefs {
  inApp: boolean;
  email: boolean;
  push: boolean;
}

interface NotificationPreferences {
  reactions: ChannelPrefs;
  comments: ChannelPrefs;
  mentions: ChannelPrefs;
  tips: ChannelPrefs;
  reports: ChannelPrefs;
  system: ChannelPrefs;
  enableQuietHours: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timezone: string | null;
}

type CategoryKey = 'reactions' | 'comments' | 'mentions' | 'tips' | 'reports' | 'system';
type ChannelKey = 'inApp' | 'email' | 'push';

const DEFAULT_PREFS: NotificationPreferences = {
  reactions: { inApp: true, email: true, push: true },
  comments: { inApp: true, email: true, push: true },
  mentions: { inApp: true, email: true, push: true },
  tips: { inApp: true, email: true, push: true },
  reports: { inApp: true, email: true, push: true },
  system: { inApp: true, email: true, push: true },
  enableQuietHours: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
  timezone: null,
};

const CATEGORIES: { key: CategoryKey; label: string; description: string }[] = [
  { key: 'reactions', label: 'Reactions', description: 'When someone reacts to your confession' },
  { key: 'comments', label: 'Comments', description: 'When someone comments on your confession' },
  { key: 'mentions', label: 'Mentions', description: 'When someone mentions you' },
  { key: 'tips', label: 'Tips', description: 'When someone sends you a tip' },
  { key: 'reports', label: 'Reports', description: 'Updates on content reports' },
  { key: 'system', label: 'System', description: 'System announcements and updates' },
];

const CHANNELS: { key: ChannelKey; label: string; icon: React.ReactNode }[] = [
  { key: 'inApp', label: 'In-App', icon: <Bell className="w-4 h-4" /> },
  { key: 'email', label: 'Email', icon: <Mail className="w-4 h-4" /> },
  { key: 'push', label: 'Push', icon: <Smartphone className="w-4 h-4" /> },
];

export default function NotificationSettingsPage() {
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useGlobalToast();

  const loadPreferences = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/users/notification-preferences', { credentials: 'include' });
      if (!response.ok) {
        const error = await normalizeApiError(response);
        throw new Error(error.message);
      }
      const data = await response.json();
      setPreferences({
        reactions: { inApp: true, email: true, push: true, ...data.reactions },
        comments: { inApp: true, email: true, push: true, ...data.comments },
        mentions: { inApp: true, email: true, push: true, ...data.mentions },
        tips: { inApp: true, email: true, push: true, ...data.tips },
        reports: { inApp: true, email: true, push: true, ...data.reports },
        system: { inApp: true, email: true, push: true, ...data.system },
        enableQuietHours: data.enableQuietHours ?? false,
        quietHoursStart: data.quietHoursStart ?? '22:00',
        quietHoursEnd: data.quietHoursEnd ?? '08:00',
        timezone: data.timezone ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notification preferences');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPreferences(); }, [loadPreferences]);

  const toggleChannel = (category: CategoryKey, channel: ChannelKey) => {
    setPreferences((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [channel]: !prev[category][channel],
      },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = {
        reactions: preferences.reactions,
        comments: preferences.comments,
        mentions: preferences.mentions,
        tips: preferences.tips,
        reports: preferences.reports,
        system: preferences.system,
        enableQuietHours: preferences.enableQuietHours,
        quietHoursStart: preferences.quietHoursStart,
        quietHoursEnd: preferences.quietHoursEnd,
        timezone: preferences.timezone,
      };

      const response = await fetch('/api/users/notification-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await normalizeApiError(response);
        throw new Error(error.message);
      }
      toast.success('Notification preferences saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-red-900/20 border border-red-800 rounded-xl p-6 text-center">
          <p className="text-red-200 mb-4">{error}</p>
          <button onClick={loadPreferences} className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <Bell className="w-8 h-8 text-purple-500" />
          Notification Preferences
        </h1>
        <p className="text-gray-400 mt-2">
          Control which notifications you receive and how they are delivered
        </p>
      </div>

      {/* Category × Channel Matrix */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left p-4 text-gray-400 font-medium">Category</th>
                {CHANNELS.map((ch) => (
                  <th key={ch.key} className="p-4 text-gray-400 font-medium text-center">
                    <div className="flex items-center justify-center gap-1">
                      {ch.icon}
                      <span className="hidden sm:inline">{ch.label}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map((cat) => (
                <tr key={cat.key} className="border-b border-zinc-800 last:border-0 hover:bg-zinc-800/50">
                  <td className="p-4">
                    <p className="text-white font-medium">{cat.label}</p>
                    <p className="text-gray-500 text-sm">{cat.description}</p>
                  </td>
                  {CHANNELS.map((ch) => (
                    <td key={ch.key} className="p-4 text-center">
                      <button
                        onClick={() => toggleChannel(cat.key, ch.key)}
                        className={`w-10 h-6 rounded-full transition-colors relative ${
                          preferences[cat.key][ch.key] ? 'bg-purple-600' : 'bg-zinc-700'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                            preferences[cat.key][ch.key] ? 'translate-x-[18px]' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quiet Hours */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Moon className="w-6 h-6 text-indigo-400" />
            <div>
              <h2 className="text-lg font-semibold text-white">Quiet Hours</h2>
              <p className="text-sm text-gray-400">Suppress notifications during specified hours</p>
            </div>
          </div>
          <button
            onClick={() => setPreferences((p) => ({ ...p, enableQuietHours: !p.enableQuietHours }))}
            className={`w-12 h-7 rounded-full transition-colors relative ${
              preferences.enableQuietHours ? 'bg-purple-600' : 'bg-zinc-700'
            }`}
          >
            <span
              className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                preferences.enableQuietHours ? 'translate-x-[22px]' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {preferences.enableQuietHours && (
          <div className="flex flex-wrap gap-4 mt-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" />
              <label className="text-sm text-gray-300">From:</label>
              <input
                type="time"
                value={preferences.quietHoursStart || '22:00'}
                onChange={(e) => setPreferences((p) => ({ ...p, quietHoursStart: e.target.value }))}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" />
              <label className="text-sm text-gray-300">To:</label>
              <input
                type="time"
                value={preferences.quietHoursEnd || '08:00'}
                onChange={(e) => setPreferences((p) => ({ ...p, quietHoursEnd: e.target.value }))}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm"
              />
            </div>
          </div>
        )}
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-xl text-white font-medium transition-colors"
      >
        {saving ? (
          <>
            <RefreshCw className="w-5 h-5 animate-spin" />
            Saving...
          </>
        ) : (
          <>
            <Save className="w-5 h-5" />
            Save Preferences
          </>
        )}
      </button>
    </div>
  );
}
