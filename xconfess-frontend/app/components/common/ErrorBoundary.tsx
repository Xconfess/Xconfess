'use client';

import React, { Component, ReactNode } from 'react';
import { getErrorMessage, logError } from '@/app/lib/utils/errorHandler';
import { AlertCircle, RotateCcw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  onReset?: () => void;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  hasError: boolean;
  error: any | null; // Changed to any to allow accessing custom properties
  errorCount: number;
  correlationId?: string;
}

export class ErrorBoundary extends Component<Props, State> {
  private previousHasError = false;

  state: State = {
    hasError: false,
    error: null,
    errorCount: 0,
  };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: React.ErrorInfo) {
    const errorCount = this.state.errorCount + 1;

    // Extract correlationId if available (from AxiosError or AppError)
    const correlationId = error.config?.correlationId || error.details?.correlationId || error.correlationId;

    logError(error, 'ErrorBoundary', {
      componentStack: errorInfo.componentStack,
      errorCount,
      correlationId,
    });

    this.setState({ errorCount, correlationId });

    if (errorCount > 3) {
      console.error('Critical: Too many consecutive errors detected');
    }
  }

  private errorContainerCallback = (node: HTMLDivElement | null) => {
    if (node && !this.previousHasError) {
      node.focus();
    }
    this.previousHasError = this.state.hasError;
  };

  handleReset = () => {
    this.props.onReset?.();
    this.setState({ hasError: false, error: null, errorCount: 0, correlationId: undefined });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleReset);
      }

      return (
        <div
          ref={this.errorContainerCallback}
          role="alert"
          aria-live="assertive"
          tabIndex={-1}
          className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4 font-sans text-[var(--foreground)] focus:outline-none"
        >
          <div className="bg-[var(--background)] rounded-xl p-8 max-w-md w-full border border-[var(--danger)]/50 shadow-[0_0_50px_-12px_rgba(220,38,38,0.3)]">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-[var(--danger)]/10 rounded-lg">
                <AlertCircle aria-hidden="true" className="w-8 h-8 text-[var(--danger)]" />
              </div>
              <div>
                <h2 className="text-xl font-black tracking-tight uppercase">Console Crash</h2>
                <p className="text-[var(--danger)] text-xs font-mono font-semibold">ERROR_CODE: 0x559</p>
              </div>
            </div>

            <p className="text-[var(--text-muted)] text-sm mb-6 leading-relaxed">
              {getErrorMessage(this.state.error) ||
                'An unexpected runtime error occurred during template sync.'}
            </p>

            {this.state.correlationId && (
              <div className="mb-6 p-2 bg-[var(--surface)] rounded border border-[var(--border)]">
                <p className="text-[10px] text-[var(--text-muted)] font-mono uppercase tracking-wide mb-1">Correlation ID</p>
                <p className="text-xs font-mono text-[var(--secondary)] break-all">{this.state.correlationId}</p>
              </div>
            )}

            {process.env.NODE_ENV === 'development' && (
              <details className="mb-6 text-[10px] text-[var(--text-muted)] bg-[var(--surface)] p-3 rounded border border-[var(--border)]">
                <summary className="cursor-pointer font-mono uppercase tracking-wide hover:text-[var(--secondary)] transition-colors">
                  View Trace Log
                </summary>
                <pre className="mt-3 overflow-auto max-h-32 font-mono text-[var(--danger)] whitespace-pre-wrap text-[9px]">
                  {this.state.error.stack}
                </pre>
              </details>
            )}

            <div className="flex flex-col gap-3">
              <button
                onClick={this.handleReset}
                className="w-full bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--skeleton)] py-3 rounded-lg text-sm transition-all font-semibold flex items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border)]"
              >
                <RotateCcw aria-hidden="true" size={16} /> REBOOT CONSOLE
              </button>
              <button
                onClick={() => (window.location.href = '/')}
                className="w-full bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-muted)] py-3 rounded-lg text-sm transition-all font-medium flex items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border)]"
              >
                <Home aria-hidden="true" size={16} /> RETURN_HOME
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}