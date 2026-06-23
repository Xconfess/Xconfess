"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { Shield, Eye, MessageSquare, Database, Save, Download, RefreshCw, Clock, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { useGlobalToast } from '@/app/components/common/Toast';

interface PrivacySettings {
  isDiscoverable: boolean;
  canReceiveReplies: boolean;
  showReactions: boolean;
  dataProcessingConsent: boolean;
}

type ExportStatus = 'pending' | 'processing' | 'ready' | 'expired' | 'failed' | 'unknown';

interface ExportJob {
  id: string;
  status: ExportStatus;
  createdAt: string;
  completedAt?: string;
  expiresAt?: string;
  failureReason?: string;
  downloadUrl?: string;
  downloadToken?: string;
  fileSize?: number;
  retryCount?: number;
}

const STATUS_CONFIG: Record<ExportStatus, { icon: typeof CheckCircle; color: string; label: string; bgColor: string }> = {
  pending: { icon: Clock, color: 'text-yellow-400', label: 'Pending', bgColor: 'bg-yellow-400/10' },
  processing: { icon: RefreshCw, color: 'text-blue-400', label: 'Processing', bgColor: 'bg-blue-400/10' },
  ready: { icon: CheckCircle, color: 'text-green-400', label: 'Ready', bgColor: 'bg-green-400/10' },
  expired: { icon: AlertTriangle, color: 'text-orange-400', label: 'Expired', bgColor: 'bg-orange-400/10' },
  failed: { icon: XCircle, color: 'text-red-400', label: 'Failed', bgColor: 'bg-red-400/10' },
  unknown: { icon: AlertTriangle, color: 'text-gray-400', label: 'Unknown', bgColor: 'bg-gray-400/10' },
};

export default function PrivacySettingsPage() {
  const [settings, setSettings] = useState<PrivacySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const toast = useGlobalToast();

  // Export state
  const [exportJobs, setExportJobs] = useState<ExportJob[]>([]);
  const [exportLoading, setExportLoading] = useState(false);
  const [requestingExport, setRequestingExport] = useState(false);

  const loadSettings = useCallback(async () => {
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

  const loadExportHistory = useCallback(async () => {
    setExportLoading(true);
    try {
      const response = await fetch('/api/data-export/history', {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to load export history');
      }

      const data = await response.json();
      const jobs: ExportJob[] = (data.history || []).map((job: any) => ({
        id: job.id,
        status: job.status || 'unknown',
        createdAt: job.createdAt || job.created_at,
        completedAt: job.completedAt || job.completed_at,
        expiresAt: job.expiresAt || job.expires_at,
        failureReason: job.failureReason || job.failure_reason,
        downloadUrl: job.downloadUrl || job.download_url,
        downloadToken: job.downloadToken || job.download_token,
        fileSize: job.fileSize || job.file_size,
        retryCount: job.retryCount || job.retry_count,
      }));
      setExportJobs(jobs);
    } catch {
      // Silently fail for export history — not critical
    } finally {
      setExportLoading(false);
    }
  }, []);

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

  const handleRequestExport = async () => {
    setRequestingExport(true);
    try {
      const response = await fetch('/api/data-export/request', {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to request export');
      }

      const data = await response.json();
      const newJob: ExportJob = {
        id: data.id,
        status: data.status || 'pending',
        createdAt: data.createdAt || new Date().toISOString(),
      };

      setExportJobs(prev => [newJob, ...prev]);
      toast.success('Data export requested. You will be notified when it is ready.');
    } catch {
      toast.error('Failed to request data export');
    } finally {
      setRequestingExport(false);
    }
  };

  const handleDownload = (job: ExportJob) => {
    if (job.downloadUrl) {
      window.open(job.downloadUrl, '_blank');
    } else {
      toast.error('Download link not available. Request a new export.');
    }
  };

  const handleRetryExport = async () => {
    await handleRequestExport();
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
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

      {/* Data Export Section */}
      <div className="bg-gray-800 rounded-lg mb-6">
        <div className="p-4 border-b border-gray-700">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Download className="h-4 w-4" />
            Data Export
          </h2>
          <p className="text-sm text-gray-400">Request and download your data</p>
        </div>
        <div className="p-4">
          <div className="mb-4">
            <button
              onClick={() => { void handleRequestExport(); }}
              disabled={requestingExport}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 px-4 rounded flex items-center gap-2 transition-colors"
            >
              <Download className="h-4 w-4" />
              {requestingExport ? 'Requesting...' : 'Request Data Export'}
            </button>
            <p className="text-xs text-gray-500 mt-2">
              You can request a new export once the current one is ready or expired.
            </p>
          </div>

          {exportLoading ? (
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Loading export history...
            </div>
          ) : exportJobs.length > 0 ? (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-gray-300">Export History</h3>
              {exportJobs.map((job) => {
                const config = STATUS_CONFIG[job.status] || STATUS_CONFIG.unknown;
                const StatusIcon = config.icon;
                return (
                  <div
                    key={job.id}
                    className={`rounded-lg border border-gray-700 p-3 ${config.bgColor}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <StatusIcon className={`h-4 w-4 ${config.color} ${job.status === 'processing' ? 'animate-spin' : ''}`} />
                        <span className={`text-sm font-medium ${config.color}`}>
                          {config.label}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">
                        {formatDate(job.createdAt)}
                      </span>
                    </div>

                    {job.status === 'ready' && job.downloadUrl && (
                      <div className="mt-2">
                        <button
                          onClick={() => handleDownload(job)}
                          className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
                        >
                          <Download className="h-3 w-3" />
                          Download Export
                        </button>
                        {job.expiresAt && (
                          <p className="text-xs text-gray-500 mt-1">
                            Expires: {formatDate(job.expiresAt)}
                          </p>
                        )}
                      </div>
                    )}

                    {job.status === 'expired' && (
                      <div className="mt-2">
                        <p className="text-xs text-orange-400">
                          This export has expired. Request a new one to download your data.
                        </p>
                        <button
                          onClick={() => { void handleRetryExport(); }}
                          className="text-sm text-blue-400 hover:text-blue-300 mt-1"
                        >
                          Request New Export
                        </button>
                      </div>
                    )}

                    {job.status === 'failed' && (
                      <div className="mt-2">
                        <p className="text-xs text-red-400">
                          {job.failureReason || 'Export failed due to an unexpected error.'}
                        </p>
                        <button
                          onClick={() => { void handleRetryExport(); }}
                          className="text-sm text-blue-400 hover:text-blue-300 mt-1"
                        >
                          Retry Export
                        </button>
                      </div>
                    )}

                    {(job.status === 'pending' || job.status === 'processing') && (
                      <p className="text-xs text-gray-500 mt-1">
                        {job.status === 'pending'
                          ? 'Your export is queued and will be processed shortly.'
                          : 'Your export is being prepared. This may take a few minutes.'}
                      </p>
                    )}

                    {job.retryCount && job.retryCount > 0 && (
                      <p className="text-xs text-gray-500 mt-1">
                        Retries: {job.retryCount}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No export history. Request your first data export above.</p>
          )}
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
    </div>
  );
}
