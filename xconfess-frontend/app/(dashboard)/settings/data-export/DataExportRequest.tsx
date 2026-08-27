'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { AlertCircle, CheckCircle2, Clock3, Download, Loader2, RotateCw, ShieldCheck, XCircle } from 'lucide-react';
import ErrorState from '@/app/components/common/ErrorState';
import { useGlobalToast } from '@/app/components/common/Toast';
import {
  dataExportApi,
  type DataExportHistoryItem,
  type DataExportStatus,
} from '@/app/lib/api/client';

const STORAGE_KEY = 'xconfess-active-export-job';
const POLLING_INTERVAL = 5000;
const FOCUS_RECOVERY_DELAY = 1000;

/** HTTP status code the server returns when an active export already exists. */
const CONFLICT_STATUS = 409;

export default function DataExportRequest() {
  const { addToast } = useGlobalToast();
  const [history, setHistory] = useState<DataExportHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [requestingExport, setRequestingExport] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastNotifiedStatus, setLastNotifiedStatus] = useState<Record<string, DataExportStatus>>({});
  /** Prevents concurrent submissions from double-clicks or fast retries. */
  const submittingRef = useRef(false);
  
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const focusRecoveryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isPageVisibleRef = useRef(true);

  const handleStatusChange = useCallback((jobId: string, newStatus: DataExportStatus, oldStatus: DataExportStatus) => {
    // Only show notification for meaningful transitions
    const meaningfulTransitions: Record<DataExportStatus, DataExportStatus[]> = {
      'PENDING': ['PROCESSING'],
      'PROCESSING': ['READY', 'FAILED'],
      'READY': [],
      'FAILED': [],
      'EXPIRED': []
    };
    
    if (meaningfulTransitions[oldStatus]?.includes(newStatus)) {
      const message = newStatus === 'READY' 
        ? 'Your data export is ready for download!'
        : newStatus === 'FAILED'
        ? 'Your data export failed. Please try again.'
        : `Export status changed to ${newStatus.toLowerCase()}`;
      
      // Use toast notification here - would need to integrate with toast system
      addToast(message, newStatus === 'READY' ? 'success' : newStatus === 'FAILED' ? 'error' : 'info');
      
      setLastNotifiedStatus((prev: Record<string, DataExportStatus>) => ({ ...prev, [jobId]: newStatus }));
    }
  }, [addToast]);

  const loadHistory = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoadingHistory(true);
    }

    try {
      const data = await dataExportApi.getHistory();
      setHistory(data.history);
      setError(null);
      
      // Update active job tracking
      const activeJobs = data.history.filter((item: DataExportHistoryItem) => 
        item.status === 'PENDING' || item.status === 'PROCESSING'
      );
      
      if (activeJobs.length > 0) {
        localStorage.setItem(STORAGE_KEY, activeJobs[0].id);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
      
      // Check for status changes to show notifications
      activeJobs.forEach((job: DataExportHistoryItem) => {
        const prevStatus = lastNotifiedStatus[job.id];
        if (prevStatus && prevStatus !== job.status) {
          handleStatusChange(job.id, job.status, prevStatus);
        }
      });
      
    } catch {
      setError('Failed to load data export history. Please try again.');
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setLoadingHistory(false);
      }
    }
  }, [lastNotifiedStatus, handleStatusChange]);

  useEffect(() => {
    // Restore active job from localStorage on mount
    const savedJobId = localStorage.getItem(STORAGE_KEY);
    
    const initialize = async () => {
      await loadHistory();
      
      // If we had a saved job ID, check if it's still active
      if (savedJobId) {
        const hasActiveJob = history.some((item: DataExportHistoryItem) => 
          item.id === savedJobId && (item.status === 'PENDING' || item.status === 'PROCESSING')
        );
        
        if (!hasActiveJob) {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    };
    
    initialize();
  }, [loadHistory, history]);

  const hasInProgressJob = useMemo(
    () => history.some((item: DataExportHistoryItem) => item.status === 'PENDING' || item.status === 'PROCESSING'),
    [history],
  );

  const latest = history[0] ?? null;

  const startPolling = useCallback(() => {
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
    }
    
    pollingTimerRef.current = setInterval(() => {
      if (isPageVisibleRef.current) {
        loadHistory(true);
      }
    }, POLLING_INTERVAL);
  }, [loadHistory]);
  
  const stopPolling = useCallback(() => {
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!hasInProgressJob) {
      stopPolling();
      return;
    }

    startPolling();

    return () => stopPolling();
  }, [hasInProgressJob, startPolling, stopPolling]);
  
  // Handle page visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      isPageVisibleRef.current = !document.hidden;
      
      if (!document.hidden && hasInProgressJob) {
        // Page became visible again, reconcile after a short delay
        if (focusRecoveryTimerRef.current) {
          clearTimeout(focusRecoveryTimerRef.current);
        }
        
        focusRecoveryTimerRef.current = setTimeout(() => {
          loadHistory(true);
        }, FOCUS_RECOVERY_DELAY);
      }
    };
    
    const handleFocus = () => {
      if (hasInProgressJob) {
        loadHistory(true);
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      if (focusRecoveryTimerRef.current) {
        clearTimeout(focusRecoveryTimerRef.current);
      }
    };
  }, [hasInProgressJob, loadHistory]);

  
  const handleRequestExport = async () => {
    // Guard against concurrent submissions from fast double-clicks or slow networks.
    if (submittingRef.current || requestingExport || hasInProgressJob) return;

    submittingRef.current = true;
    setRequestingExport(true);
    setError(null);
    try {
      const response = await dataExportApi.requestExport();
      if (response.requestId) {
        localStorage.setItem(STORAGE_KEY, response.requestId);
      }
      addToast('Export request submitted successfully!', 'success');
      await loadHistory(true);
    } catch (err: unknown) {
      const status = (err as { status?: number; response?: { status?: number } })?.status
        ?? (err as { status?: number; response?: { status?: number } })?.response?.status;

      if (status === CONFLICT_STATUS) {
        // Server already has an active job for this user — sync UI state.
        addToast('An export is already in progress. Check the status below.', 'info');
        await loadHistory(true);
      } else {
        setError('Unable to request a new archive right now. Please try again shortly.');
      }
    } finally {
      submittingRef.current = false;
      setRequestingExport(false);
    }
  };

  const handleRedownload = async (item: DataExportHistoryItem) => {
    if (!item.canRedownload) {
      return;
    }

    setActionLoadingId(item.id);
    try {
      const response = await dataExportApi.redownload(item.id);
      window.open(response.downloadUrl, '_blank', 'noopener,noreferrer');
      setError(null);
    } catch {
      setError('Download link is no longer valid. Request a new link from this row.');
      await loadHistory(true);
    } finally {
      setActionLoadingId(null);
    }
  };

  const formatStatus = (status: DataExportStatus) => {
    switch (status) {
      case 'PENDING':
        return 'Pending';
      case 'PROCESSING':
        return 'Processing';
      case 'READY':
        return 'Complete';
      case 'FAILED':
        return 'Failed';
      case 'EXPIRED':
        return 'Expired';
      default:
        return status;
    }
  };

  const statusBadgeClass: Record<DataExportStatus, string> = {
    PENDING: 'bg-amber-100 text-amber-800',
    PROCESSING: 'bg-blue-100 text-blue-800',
    READY: 'bg-green-100 text-green-800',
    FAILED: 'bg-red-100 text-red-800',
    EXPIRED: 'bg-slate-200 text-slate-700',
  };

  const statusIcon = (status: DataExportStatus) => {
    switch (status) {
      case 'READY':
        return <CheckCircle2 size={15} className="text-green-600" />;
      case 'FAILED':
        return <XCircle size={15} className="text-red-500" />;
      case 'PENDING':
      case 'PROCESSING':
        return <Clock3 size={15} className="text-amber-600" />;
      case 'EXPIRED':
      default:
        return <AlertCircle size={15} className="text-slate-500" />;
    }
  };

  const retentionMessage = (item: DataExportHistoryItem) => {
    if (item.status === 'READY' && item.expiresAt) {
      return `Download expires ${new Date(item.expiresAt).toLocaleString()}.`;
    }
    if (item.status === 'EXPIRED') {
      return 'Secure link expired. Request a new export link.';
    }
    if (item.status === 'FAILED') {
      return 'Generation failed. Request a new export to retry.';
    }
    return 'Archive retained for 24 hours once complete.';
  };

  if (loadingHistory) {
    return (
      <div className="max-w-4xl p-8 bg-white rounded-2xl border border-slate-200">
        <p className="text-sm text-slate-500">Loading export history...</p>
      </div>
    );
  }

  if (error && history.length === 0) {
    return (
      <ErrorState
        title="Unable to load exports"
        error={error}
        description="We could not fetch your export history."
        onRetry={() => loadHistory()}
      />
    );
  }

  return (
    <div className="max-w-4xl p-8 bg-white rounded-2xl border border-slate-200">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Export Your Data</h1>
        <p className="text-slate-500 mt-2">
          Request a download of all your personal information, confessions, and activity logs.
        </p>
      </header>

      <div className="flex gap-4 p-4 mb-8 bg-slate-50 rounded-xl border border-slate-100">
        <ShieldCheck className="text-indigo-600 w-6 h-6 shrink-0" />
        <div>
          <h4 className="font-semibold text-slate-800 text-sm">Privacy & Portability</h4>
          <p className="text-xs text-slate-600 leading-relaxed mt-1">
            To comply with GDPR, we provide your data in JSON (for machines) and CSV (for humans) formats.
            Once your file is ready, you have 24 hours to download it before the link expires.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-base font-semibold text-slate-900">Export Requests</h2>
        <button
          type="button"
          onClick={() => loadHistory(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 text-sm px-3 py-2 border rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          <RotateCw size={14} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white border rounded-xl p-6">
        <div className="text-center py-3 border-b border-slate-100 mb-4">
          <button
            onClick={handleRequestExport}
            disabled={requestingExport || hasInProgressJob}
            aria-disabled={requestingExport || hasInProgressJob}
            aria-live="polite"
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-6 rounded-lg transition-all disabled:bg-slate-300 disabled:cursor-not-allowed"
          >
            {requestingExport && <Loader2 size={15} className="animate-spin" />}
            {requestingExport ? 'Initiating...' : 'Generate New Archive'}
          </button>
          <p className="text-[11px] text-slate-400 mt-3 italic">
            You can request an export once every 7 days.
          </p>
          {hasInProgressJob && (
            <p className="text-xs text-amber-700 mt-2 flex items-center justify-center gap-1">
              <Clock3 size={12} className="shrink-0" />
              An export is already in progress — the button will re-enable once it completes.
            </p>
          )}
        </div>

        {history.length === 0 ? (
          <p className="text-sm text-slate-500">No export requests yet.</p>
        ) : (
          <div className="space-y-3">
            {history.map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-100 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {statusIcon(item.status)}
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusBadgeClass[item.status]}`}>
                        {formatStatus(item.status)}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-slate-900">
                      Requested {new Date(item.createdAt).toLocaleString()}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">{retentionMessage(item)}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    {item.canRedownload && (
                      <button
                        type="button"
                        onClick={() => handleRedownload(item)}
                        disabled={actionLoadingId === item.id}
                        className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                      >
                        <Download size={14} />
                        {actionLoadingId === item.id ? 'Preparing...' : 'Re-download'}
                      </button>
                    )}

                    {item.canRequestNewLink && (
                      <button
                        type="button"
                        onClick={handleRequestExport}
                        disabled={requestingExport || hasInProgressJob}
                        aria-disabled={requestingExport || hasInProgressJob}
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {requestingExport && <Loader2 size={12} className="animate-spin" />}
                        Request New Link
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {latest?.status === 'FAILED' && (
        <div className="mt-4 flex items-center gap-2 text-red-600 text-sm">
          <AlertCircle size={16} />
          <span>Something went wrong. Please try again in a few minutes.</span>
        </div>
      )}
    </div>
  );
}
