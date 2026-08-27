'use client';

import React, { Component, ReactNode, useCallback, useEffect, useState } from 'react';
import { rolloutApi, type TemplateRollout } from '@/app/api/client';
import { Table, THead, TBody, Th } from '@/app/components/ui/table';
import { logError } from '@/app/lib/utils/errorHandler';
import {
  Zap,
  ArrowUpCircle,
  RotateCcw,
  Activity,
  CheckCircle2,
  AlertCircle,
  Home,
} from 'lucide-react';
import { useGlobalToast } from '@/app/components/common/Toast';
import { useAdminConfirmation } from '@/app/components/admin/useAdminConfirmation';

interface EBProps {
  children: ReactNode;
  onReset?: () => void;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface EBState {
  hasError: boolean;
  error: Error | null;
  errorCount: number;
}

class ErrorBoundary extends Component<EBProps, EBState> {
  state: EBState = { hasError: false, error: null, errorCount: 0 };

  static getDerivedStateFromError(error: Error): Partial<EBState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const errorCount = this.state.errorCount + 1;
    logError(error, 'ErrorBoundary', {
      componentStack: errorInfo.componentStack,
      errorCount,
    });
    this.setState({ errorCount });
    if (errorCount > 3) console.error('Critical: Too many consecutive errors');
  }

  handleReset = () => {
    this.props.onReset?.();
    this.setState({ hasError: false, error: null, errorCount: 0 });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleReset);
      }

      return (
        <div className="min-h-screen bg-black flex items-center justify-center p-4 font-sans text-white">
          <div className="bg-zinc-950 rounded-xl p-8 max-w-md w-full border border-red-900/50 shadow-[0_0_50px_-12px_rgba(220,38,38,0.3)]">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-red-500/10 rounded-lg">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <div>
                <h2 className="text-xl font-black tracking-tight uppercase">Console Crash</h2>
                <p className="text-red-500/80 text-xs font-mono font-bold">ERROR_CODE: 0x559</p>
              </div>
            </div>
            <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
              {this.state.error.message || 'An unexpected runtime error occurred during template sync.'}
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={this.handleReset}
                className="w-full bg-white text-black hover:bg-zinc-200 py-3 rounded-lg text-sm transition-all font-bold flex items-center justify-center gap-2"
              >
                <RotateCcw size={16} /> REBOOT CONSOLE
              </button>
              <button
                onClick={() => (window.location.href = '/')}
                className="w-full bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800 py-3 rounded-lg text-sm transition-all font-medium flex items-center justify-center gap-2"
              >
                <Home size={16} /> RETURN_HOME
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function AdminTemplatesPage() {
  const [templates, setTemplates] = useState<TemplateRollout[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useGlobalToast();
  const { openConfirmation, confirmDialog } = useAdminConfirmation();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await rolloutApi.getTemplates();
      setTemplates(data);
    } catch {
      toast.error('Failed to load rollout templates.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return (
    <ErrorBoundary onReset={loadData}>
      {confirmDialog}

      <div className="min-h-screen bg-black text-white p-8">
        <header className="max-w-7xl mx-auto mb-12 flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2 text-orange-500 mb-2 font-mono text-xs font-bold tracking-[0.2em]">
              <Activity size={14} /> SYSTEM_ADMIN_LOGGED_IN
            </div>
            <h1 className="text-5xl font-black tracking-tighter italic uppercase">Rollout Console</h1>
          </div>
          <div className="text-right">
            <p className="text-zinc-500 text-xs font-mono uppercase tracking-widest leading-relaxed">Node_Status: Online</p>
            <p className="text-zinc-500 text-xs font-mono uppercase tracking-widest leading-relaxed">Traffic_Control: Active</p>
          </div>
        </header>

        <main className="max-w-7xl mx-auto">
          {loading ? (
            <div className="flex items-center gap-4 text-zinc-600 font-mono italic animate-pulse">
              <div className="w-2 h-2 bg-orange-600 rounded-full" /> FETCHING_METRICS...
            </div>
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th>Template ID</Th>
                  <Th>Version State</Th>
                  <Th>Traffic Weight</Th>
                  <Th>Integrity</Th>
                  <th className="px-6 py-4 text-right text-xs font-bold text-zinc-500 uppercase tracking-widest sticky right-0 bg-zinc-900/50 after:absolute after:inset-y-0 after:left-0 after:w-px after:bg-zinc-800">
                    Emergency
                  </th>
                </tr>
              </THead>
              <TBody>
                {templates.map((t) => (
                  <tr
                    key={t.key}
                    className="border-b border-zinc-900 last:border-0 hover:bg-zinc-900/40 transition-all"
                  >
                    <td className="px-6 py-6 font-mono text-blue-500 text-sm font-bold tracking-tight">
                      {t.key}
                    </td>
                    <td className="px-6 py-6 flex flex-col gap-1">
                      <span className="text-[10px] text-zinc-500 font-bold uppercase">
                        Stable: <span className="text-green-500">v{t.activeVersion}</span>
                      </span>
                      {t.canaryVersion && (
                        <span className="text-[10px] text-zinc-500 font-bold uppercase">
                          Canary: <span className="text-orange-500">v{t.canaryVersion}</span>
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-6">
                      <div className="flex items-center gap-4">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="5"
                          value={t.canaryPercentage}
                          onChange={(e) =>
                            rolloutApi
                              .updateCanary(t.key, parseInt(e.target.value, 10))
                              .then(() => loadData())
                          }
                          className="w-32 accent-orange-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                        />
                        <span className="text-xl font-mono font-black">{t.canaryPercentage}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-6 uppercase font-black text-[10px] tracking-widest">
                      {t.status === 'healthy' ? (
                        <span className="text-green-500 flex items-center gap-1.5">
                          <CheckCircle2 size={12} /> Healthy
                        </span>
                      ) : (
                        <span className="text-red-500 flex items-center gap-1.5">
                          <AlertCircle size={12} /> {t.status}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-6 text-right space-x-1 sticky right-0 bg-zinc-950 after:absolute after:inset-y-0 after:left-0 after:w-px after:bg-zinc-800">
                      <button
                        onClick={() =>
                          openConfirmation({
                            title: 'PROMOTE rollout?',
                            description: `This action will impact live traffic for ${t.key}.`,
                            confirmLabel: 'PROMOTE',
                            action: async () => {
                              await rolloutApi.promote(t.key);
                              await loadData();
                            },
                            successMessage: `PROMOTE completed for ${t.key}.`,
                            errorMessage: 'Operation failed. Monitoring team notified.',
                          })
                        }
                        className="p-2 text-zinc-600 hover:text-blue-500"
                      >
                        <ArrowUpCircle size={20} />
                      </button>
                      <button
                        onClick={() =>
                          openConfirmation({
                            title: 'ROLLBACK rollout?',
                            description: `This action will impact live traffic for ${t.key}.`,
                            confirmLabel: 'ROLLBACK',
                            action: async () => {
                              await rolloutApi.rollback(t.key);
                              await loadData();
                            },
                            successMessage: `ROLLBACK completed for ${t.key}.`,
                            errorMessage: 'Operation failed. Monitoring team notified.',
                          })
                        }
                        className="p-2 text-zinc-600 hover:text-yellow-500"
                      >
                        <RotateCcw size={20} />
                      </button>
                      <button
                        onClick={() =>
                          openConfirmation({
                            title: 'KILL rollout?',
                            description: `This action will impact live traffic for ${t.key}.`,
                            confirmLabel: 'KILL',
                            variant: 'danger',
                            action: async () => {
                              await rolloutApi.killSwitch(t.key);
                              await loadData();
                            },
                            successMessage: `KILL completed for ${t.key}.`,
                            errorMessage: 'Operation failed. Monitoring team notified.',
                          })
                        }
                        className="p-2 text-zinc-600 hover:text-red-500"
                      >
                        <Zap size={20} />
                      </button>
                    </td>
                  </tr>
                ))}
              </TBody>
            </Table>
          )}
        </main>
      </div>
    </ErrorBoundary>
  );
}
