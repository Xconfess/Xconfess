"use client";

import React, { useEffect, useState } from 'react';
import { Shield, Eye, EyeOff, MessageSquare, Database, Save, Sun, Moon, Laptop, Lock, Globe, Bell, BellOff } from 'lucide-react';
import { useGlobalToast } from '@/app/components/common/Toast';
import { normalizeApiError } from '@/app/lib/api/errors';
import { useTheme } from '@/app/lib/hooks/useTheme';

interface PrivacySettings {
  isDiscoverable: boolean;
  canReceiveReplies: boolean;
  showReactions: boolean;
  dataProcessingConsent: boolean;
}

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  id: string;
}

function ToggleSwitch({ checked, onChange, id }: ToggleProps) {
  return (
    <button
      id={id}
      role="switch"
      type="button"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:ring-offset-2 focus:ring-offset-[var(--background)] ${
        checked ? 'bg-[var(--primary)]' : 'bg-[var(--text-muted)]'
      }`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-[var(--surface)] shadow ring-0 transition duration-200 ease-in-out ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

const TOGGLE_CONFIGS: {
  key: keyof PrivacySettings;
  label: string;
  description: string;
  effect: string;
  icon: React.ReactNode;
  iconOff?: React.ReactNode;
}[] = [
  {
    key: 'isDiscoverable',
    label: 'Profile Discovery',
    description: 'Allow others to find your profile in search and the user directory.',
    effect: 'When off, your profile is hidden from search results and the public directory. Direct links to your profile will still work.',
    icon: <Globe className="h-5 w-5 text-[var(--primary-deep)]" />,
    iconOff: <Lock className="h-5 w-5 text-[var(--text-muted)]" />,
  },
  {
    key: 'canReceiveReplies',
    label: 'Allow Replies',
    description: 'Let other users reply to your confessions.',
    effect: 'When off, the reply button is disabled on all your confessions. Existing replies remain visible.',
    icon: <MessageSquare className="h-5 w-5 text-[var(--primary-deep)]" />,
  },
  {
    key: 'showReactions',
    label: 'Show Reactions',
    description: 'Display emoji reactions on your confessions.',
    effect: 'When off, reaction counts and buttons are hidden on your confessions. Others can still react, but counts are not shown.',
    icon: <Bell className="h-5 w-5 text-[var(--warning)]" />,
    iconOff: <BellOff className="h-5 w-5 text-[var(--text-muted)]" />,
  },
  {
    key: 'dataProcessingConsent',
    label: 'Data Processing Consent',
    description: 'Allow processing of your data for service improvement and analytics.',
    effect: 'When off, your usage data is excluded from analytics aggregation. Core functionality is not affected.',
    icon: <Database className="h-5 w-5 text-[var(--success)]" />,
  },
];

const THEME_OPTIONS: { key: 'light' | 'dark' | 'system'; label: string; icon: React.ReactNode }[] = [
  { key: 'light', label: 'Light', icon: <Sun className="h-4 w-4" /> },
  { key: 'dark', label: 'Dark', icon: <Moon className="h-4 w-4" /> },
  { key: 'system', label: 'System', icon: <Laptop className="h-4 w-4" /> },
];

export default function PrivacySettingsPage() {
  const { theme, setTheme } = useTheme();
  const [settings, setSettings] = useState<PrivacySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const toast = useGlobalToast();

  const loadSettings = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch('/api/users/privacy-settings', {
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await normalizeApiError(response);
        throw new Error(error.message);
      }

      const data: PrivacySettings = await response.json();
      setSettings(data);
      setDirty(false);
    } catch {
      setLoadError("Failed to load privacy settings");
      toast.error("Failed to load privacy settings");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const handleToggle = (key: keyof PrivacySettings, value: boolean) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
    setDirty(true);
  };

  const handleSave = async () => {
    if (!settings) return;

    setSaving(true);
    try {
      const response = await fetch('/api/users/privacy-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        const error = await normalizeApiError(response);
        throw new Error(error.message);
      }

      const updated: PrivacySettings = await response.json();
      setSettings(updated);
      setDirty(false);
      toast.success('Privacy settings saved successfully');
    } catch {
      toast.error('Failed to save privacy settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent-border)]" />
      </div>
    );
  }

  if (loadError || !settings) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-[var(--danger)]/10 border border-[var(--danger)]/30 rounded-xl p-6 text-center">
          <p className="text-[var(--danger)] mb-4">{loadError ?? 'Failed to load privacy settings.'}</p>
          <button onClick={loadSettings} className="px-4 py-2 bg-[var(--danger)] hover:opacity-90 rounded-lg text-white">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-[var(--foreground)] flex items-center gap-3">
          <Shield className="w-8 h-8 text-[var(--primary-deep)]" />
          Privacy Settings
        </h1>
        <p className="text-[var(--text-muted)] mt-1">
          Control your visibility, interactions, and data preferences. Each setting maps directly to how your profile behaves across the platform.
        </p>
      </div>

      <div className="bg-[var(--surface-muted)] rounded-lg mb-4">
        <div className="p-4 border-b border-[var(--border)]">
          <h2 className="font-semibold text-[var(--foreground)] flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Privacy Controls
          </h2>
          <p className="text-sm text-[var(--text-muted)]">
            Manage how your profile and content are visible to others
          </p>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {TOGGLE_CONFIGS.map((config) => {
            const isOn = settings[config.key];
            return (
              <div key={config.key} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="mt-0.5 flex-shrink-0">
                      {isOn ? config.icon : config.iconOff ?? config.icon}
                    </div>
                    <div className="min-w-0">
                      <label htmlFor={`toggle-${config.key}`} className="font-medium text-[var(--foreground)] cursor-pointer">
                        {config.label}
                      </label>
                      <p className="text-sm text-[var(--text-muted)] mt-0.5">{config.description}</p>
                      <p className="text-xs text-[var(--text-muted)] mt-1 italic">{config.effect}</p>
                    </div>
                  </div>
                  <div className="flex-shrink-0 pt-0.5">
                    <ToggleSwitch
                      id={`toggle-${config.key}`}
                      checked={isOn}
                      onChange={(val) => handleToggle(config.key, val)}
                    />
                  </div>
                </div>
                <div className="ml-8 mt-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                      isOn ? 'bg-[var(--success)]/10 text-[var(--success)]' : 'bg-[var(--surface-elevated)] text-[var(--text-muted)]'
                    }`}
                  >
                    {isOn ? (<><Eye className="h-3 w-3" /> Enabled</>) : (<><EyeOff className="h-3 w-3" /> Disabled</>)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-[var(--surface-muted)] rounded-lg mb-4 p-4">
        <h2 className="font-semibold text-[var(--foreground)] mb-3">Appearance</h2>
        <div className="flex gap-2">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setTheme(opt.key)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                theme === opt.key ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface-elevated)] text-[var(--secondary)] hover:bg-[var(--text-muted)]'
              }`}
            >
              {opt.icon}
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving || !dirty}
        className="w-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors font-medium"
      >
        {saving ? 'Saving...' : (<><Save className="h-5 w-5" /> Save Privacy Settings</>)}
      </button>

      {dirty && (
        <p className="text-center text-xs text-[var(--warning)] mt-2">
          You have unsaved changes.
        </p>
      )}
    </div>
  );
}
