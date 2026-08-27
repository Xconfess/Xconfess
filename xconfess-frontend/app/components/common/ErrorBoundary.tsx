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
          className="min-h-screen bg-black flex items-center justify-center p-4 font-sans text-white focus:outline-none"
        >
          <div className="bg-zinc-950 rounded-xl p-8 max-w-md w-full border border-red-900/50 shadow-[0_0_50px_-12px_rgba(220,38,38,0.3)]">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-red-500/10 rounded-lg">
                <AlertCircle aria-hidden="true" className="w-8 h-8 text-red-500" />
              </div>
              <div>
                <h2 className="text-xl font-black tracking-tight uppercase">Console Crash</h2>
                <p className="text-red-500/80 text-xs font-mono font-bold">ERROR_CODE: 0x559</p>
              </div>
            </div>

            <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
              {getErrorMessage(this.state.error) ||
                'An unexpected runtime error occurred during template sync.'}
            </p>

            {this.state.correlationId && (
              <div className="mb-6 p-2 bg-zinc-900 rounded border border-zinc-800">
                <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest mb-1">Correlation ID</p>
                <p className="text-xs font-mono text-zinc-300 break-all">{this.state.correlationId}</p>
              </div>
            )}

            {process.env.NODE_ENV === 'development' && (
              <details className="mb-6 text-[10px] text-zinc-500 bg-zinc-900 p-3 rounded border border-zinc-800">
                <summary className="cursor-pointer font-mono uppercase tracking-widest hover:text-zinc-300 transition-colors">
                  View Trace Log
                </summary>
                <pre className="mt-3 overflow-auto max-h-32 font-mono text-red-400/70 whitespace-pre-wrap text-[9px]">
                  {this.state.error.stack}
                </pre>
              </details>
            )}

            <div className="flex flex-col gap-3">
              <button
                onClick={this.handleReset}
                className="w-full bg-white text-black hover:bg-zinc-200 py-3 rounded-lg text-sm transition-all font-bold flex items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <RotateCcw aria-hidden="true" size={16} /> REBOOT CONSOLE
              </button>
              <button
                onClick={() => (window.location.href = '/')}
                className="w-full bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800 py-3 rounded-lg text-sm transition-all font-medium flex items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
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