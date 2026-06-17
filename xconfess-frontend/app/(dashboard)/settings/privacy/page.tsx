"use client";

import React, { useEffect, useState } from 'react';
import { Shield, Eye, MessageSquare, Database, Save } from 'lucide-react';
import { useGlobalToast } from '@/app/components/common/Toast';
import DataExportRequest from '../data-export/DataExportRequest';

interface PrivacySettings {
  isDiscoverable: boolean;
  canReceiveReplies: boolean;
  showReactions: boolean;
  dataProcessingConsent: boolean;
}

export default function PrivacySettingsPage() {
  const [settings, setSettings] = useState<PrivacySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const toast = useGlobalToast();

  const loadSettings = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const response = await fetch('/api/users/privacy-settings', {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to load settings');
      }

      const data: PrivacySettings = await response.json();
      setSettings(data);
    } catch {
      setLoadError('Failed to load privacy settings.');
      toast.error('Failed to load privacy settings');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    if (!settings) return;

    try {
      setSaving(true);
      const response = await fetch('/api/users/privacy-settings', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        throw new Error('Failed to save settings');
      }

      const updated: PrivacySettings = await response.json();
      setSettings(updated);
      toast.success('Privacy settings saved successfully');
    } catch {
      toast.error('Failed to save privacy settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="space-y-3 text-center">
          <p className="text-gray-400">{loadError ?? 'Failed to load settings'}</p>
          <button
            onClick={() => {
              void loadSettings();
            }}
            className="rounded-md border border-gray-700 px-4 py-2 text-sm text-white transition hover:bg-gray-800"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Shield className="h-6 w-6" />
          Privacy Settings
        </h1>
        <p className="text-gray-400 mt-1">
          Manage your visibility and consent controls
        </p>
      </div>

      <div className="bg-gray-800 rounded-lg mb-4">
        <div className="p-4 border-b border-gray-700">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Discoverability
          </h2>
          <p className="text-sm text-gray-400">Control your profile visibility</p>
        </div>
        <div className="p-4">
          <label className="flex items-center justify-between">
            <div>
              <div className="font-medium text-white">Profile Discovery</div>
              <div className="text-sm text-gray-400">
                Allow others to find your profile in search and directory
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.isDiscoverable}
              onChange={(e) =>
                setSettings({ ...settings, isDiscoverable: e.target.checked })
              }
              className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
            />
          </label>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg mb-4">
        <div className="p-4 border-b border-gray-700">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Interaction Controls
          </h2>
          <p className="text-sm text-gray-400">Manage replies and reactions</p>
        </div>
        <div className="p-4 space-y-4">
          <label className="flex items-center justify-between">
            <div>
              <div className="font-medium text-white">Allow Replies</div>
              <div className="text-sm text-gray-400">
                Let users reply to your confessions
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.canReceiveReplies}
              onChange={(e) =>
                setSettings({ ...settings, canReceiveReplies: e.target.checked })
              }
              className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
            />
          </label>
          <label className="flex items-center justify-between">
            <div>
              <div className="font-medium text-white">Show Reactions</div>
              <div className="text-sm text-gray-400">
                Display reactions on your confessions
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.showReactions}
              onChange={(e) =>
                setSettings({ ...settings, showReactions: e.target.checked })
              }
              className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
            />
          </label>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg mb-6">
        <div className="p-4 border-b border-gray-700">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Database className="h-4 w-4" />
            Data Handling
          </h2>
          <p className="text-sm text-gray-400">Control data processing consent</p>
        </div>
        <div className="p-4">
          <label className="flex items-center justify-between">
            <div>
              <div className="font-medium text-white">Data Processing Consent</div>
              <div className="text-sm text-gray-400">
                Allow processing of your data for service improvement
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.dataProcessingConsent}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  dataProcessingConsent: e.target.checked,
                })
              }
              className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
            />
          </label>
        </div>
      </div>

      <div className="mb-6">
        <DataExportRequest />
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 px-4 rounded flex items-center justify-center gap-2 transition-colors"
      >
        <Save className="h-4 w-4" />
        {saving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  );
}
