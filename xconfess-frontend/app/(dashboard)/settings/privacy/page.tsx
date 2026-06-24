"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { Shield, Eye, MessageSquare, Database, Save, Download, RefreshCw, Clock, CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useGlobalToast } from '@/app/components/common/Toast';

interface PrivacySettings {
  isDiscoverable: boolean;
  canReceiveReplies: boolean;
  showReactions: boolean;
  dataProcessingConsent: boolean;
}

type ExportStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED' | 'EXPIRED';

interface ExportHistoryItem {
  id: string;
  status: ExportStatus;
  createdAt: string;
  expiresAt: number | null;
  canRedownload: boolean;
  downloadUrl: string | null;
}

interface ExportHistoryResponse {
  latest: ExportHistoryItem | null;
  history: ExportHistoryItem[];
}

const statusConfig: Record<ExportStatus, { label: string; color: string; icon: React.ReactNode }> = {
  PENDING: { label: 'Queued', color: 'text-yellow-400', icon: <Clock className="h-4 w-4" /> },
  PROCESSING: { label: 'Processing', color: 'text-blue-400', icon: <Loader2 className="h-4 w-4 animate-spin" /> },
  READY: { label: 'Ready', color: 'text-green-400', icon: <CheckCircle className="h-4 w-4" /> },
  FAILED: { label: 'Failed', color: 'text-red-400', icon: <XCircle className="h-4 w-4" /> },
  EXPIRED: { label: 'Expired', color: 'text-gray-400', icon: <AlertCircle className="h-4 w-4" /> },
};

export default function PrivacySettingsPage() {
  const [settings, setSettings] = useState<PrivacySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const toast = useGlobalToast();

  // Export state
  const [exportHistory, setExportHistory] = useState<ExportHistoryItem | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportRequesting, setExportRequesting] = useState(false);

  const loadExportHistory = useCallback(async () => {
    setExportLoading(true);
    try {
      const response = await fetch('/api/users/privacy-settings/export', {
        credentials: 'include',
      });
      if (response.ok) {
        const data: ExportHistoryResponse = await response.json();
        setExportHistory(data.latest);
      }
    } catch {
      // Silently fail — export history is optional
    } finally {
      setExportLoading(false);
    }
  }, []);

  const handleRequestExport = async () => {
    setExportRequesting(true);
    try {
      const response = await fetch('/api/users/privacy-settings/export', {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to request export');
      }
      toast.success('Export requested successfully. You will be notified when it is ready.');
      // Poll for status after 2 seconds
      setTimeout(() => {
        void loadExportHistory();
      }, 2000);
    } catch {
      toast.error('Failed to request data export');
    } finally {
      setExportRequesting(false);
    }
  };

  const handleDownload = () => {
    if (!exportHistory?.downloadUrl) return;
    window.open(exportHistory.downloadUrl, '_blank');
  };

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
    void loadExportHistory();
  }, [loadSettings, loadExportHistory]);

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

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 px-4 rounded flex items-center justify-center gap-2 transition-colors"
      >
        <Save className="h-4 w-4" />
        {saving ? 'Saving...' : 'Save Settings'}
      </button>

      {/* Data Export Section */}
      <div className="mt-8">
        <div className="bg-gray-800 rounded-lg mb-4">
          <div className="p-4 border-b border-gray-700">
            <h2 className="font-semibold text-white flex items-center gap-2">
              <Database className="h-4 w-4" />
              Data Export
            </h2>
            <p className="text-sm text-gray-400">
              Request and download your personal data
            </p>
          </div>
          <div className="p-4 space-y-4">
            {/* Request button */}
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-white">Request Data Export</div>
                <div className="text-sm text-gray-400">
                  Generate a copy of your data (confessions, comments, reactions)
                </div>
              </div>
              <button
                onClick={handleRequestExport}
                disabled={exportRequesting}
                className="rounded-md border border-gray-600 px-4 py-2 text-sm text-white transition hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {exportRequesting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Requesting...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Request Export
                  </>
                )}
              </button>
            </div>

            {/* Export status */}
            {exportHistory && (
              <div className="border-t border-gray-700 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-white">Latest Export</div>
                  <button
                    onClick={() => void loadExportHistory()}
                    disabled={exportLoading}
                    className="text-sm text-blue-400 hover:text-blue-300 disabled:opacity-50 flex items-center gap-1"
                  >
                    <RefreshCw className={`h-3 w-3 ${exportLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>
                <div className="bg-gray-900 rounded-md p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={statusConfig[exportHistory.status].color}>
                        {statusConfig[exportHistory.status].icon}
                      </span>
                      <span className={`text-sm font-medium ${statusConfig[exportHistory.status].color}`}>
                        {statusConfig[exportHistory.status].label}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(exportHistory.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  {exportHistory.status === 'READY' && exportHistory.canRedownload && exportHistory.downloadUrl && (
                    <button
                      onClick={handleDownload}
                      className="mt-3 w-full bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded flex items-center justify-center gap-2 transition-colors text-sm"
                    >
                      <Download className="h-4 w-4" />
                      Download Export
                    </button>
                  )}
                  {exportHistory.status === 'FAILED' && (
                    <div className="mt-2 text-xs text-red-400">
                      Export failed. Please request a new export.
                    </div>
                  )}
                  {exportHistory.status === 'EXPIRED' && (
                    <div className="mt-2 text-xs text-gray-400">
                      Download link has expired. Request a new export.
                    </div>
                  )}
                  {exportHistory.status === 'PENDING' && (
                    <div className="mt-2 text-xs text-yellow-400">
                      Your export is queued. Check back shortly.
                    </div>
                  )}
                  {exportHistory.status === 'PROCESSING' && (
                    <div className="mt-2 text-xs text-blue-400">
                      Your export is being processed. This may take a few minutes.
                    </div>
                  )}
                </div>
              </div>
            )}

            {!exportHistory && !exportLoading && (
              <div className="text-sm text-gray-500">
                No export requests yet. Click "Request Export" to get started.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
