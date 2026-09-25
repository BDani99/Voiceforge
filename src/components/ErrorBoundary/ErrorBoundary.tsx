import { Component, type ErrorInfo, type ReactNode } from 'react';
import BrandMark from '../BrandMark/BrandMark';
import './ErrorBoundary.css';

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/** Last line of defence: a render error shows a recovery screen instead of a blank page. */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled render error:', error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="error-boundary" role="alert">
        <BrandMark size={44} />
        <h1>Something went wrong</h1>
        <p>An unexpected error occurred. Your saved work is safe.</p>
        <button type="button" onClick={() => window.location.assign('/')}>
          Reload VoiceForge
        </button>
      </div>
    );
  }
}
