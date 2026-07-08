/**
 * ErrorBoundary — class component, because there is no hook equivalent
 * for catching render-time errors.
 *
 * React 18 exposes the same shape as React 16/17. You can pass a `fallback`
 * render prop, or use the static `ErrorBoundary` with a static fallback.
 *
 * In production you'd plug a service like Sentry into `componentDidCatch`
 * — we just log to `console.error` here.
 */
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught', error, info);
  }

  reset = (): void => this.setState({ error: null });

  override render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;
    if (typeof this.props.fallback === 'function') {
      return this.props.fallback(error, this.reset);
    }
    return (
      <div role="alert" style={{ padding: 12, border: '1px solid #f87171' }}>
        <p>Something went wrong.</p>
        <pre style={{ whiteSpace: 'pre-wrap' }}>{error.message}</pre>
        <button onClick={this.reset}>try again</button>
      </div>
    );
  }
}
