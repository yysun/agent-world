/**
 * ErrorBoundary Component - Catches React errors and displays fallback UI
 * 
 * Purpose: Global error boundary for graceful error handling
 * 
 * Features:
 * - Catches unhandled errors in component tree
 * - Displays user-friendly error message
 * - Shows error details in development
 * - Reset button to recover from errors
 * 
 * Implementation:
 * - Class component (required for error boundaries)
 * - Logs errors to console
 * - Provides reset functionality
 * - Styled with Tailwind CSS
 * 
 * Changes:
 * - 2025-11-03: Created for Phase 5 (new component)
 */

import { Component, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="max-w-md p-8 bg-card border border-border rounded-lg shadow-lg">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
                <span className="text-2xl">⚠️</span>
              </div>
              <h2 className="text-xl font-semibold text-foreground font-sans">
                Something went wrong
              </h2>
            </div>

            <p className="text-muted-foreground font-sans mb-4">
              The application encountered an unexpected error. Please try refreshing the page.
            </p>

            {this.state.error && import.meta.env.DEV && (
              <details className="mb-4 p-3 bg-muted rounded-lg">
                <summary className="text-sm font-medium text-foreground font-sans cursor-pointer">
                  Error Details
                </summary>
                <pre className="mt-2 text-xs font-mono text-muted-foreground overflow-x-auto">
                  {this.state.error.toString()}
                  {this.state.error.stack && `\n\n${this.state.error.stack}`}
                </pre>
              </details>
            )}

            <div className="flex gap-3">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/80 transition-colors font-sans"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 text-sm font-medium text-muted-foreground border border-border rounded-lg hover:bg-muted transition-colors font-sans"
              >
                Refresh Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
