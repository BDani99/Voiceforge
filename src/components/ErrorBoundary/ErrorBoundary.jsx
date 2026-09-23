import React from 'react';
import PropTypes from 'prop-types';
import './ErrorBoundary.css';

/** Last line of defence: a render error shows a recovery screen instead of a blank page. */
export default class ErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled render error:', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="error-boundary" role="alert">
        <h1>Something went wrong</h1>
        <p>An unexpected error occurred. Your saved work is safe.</p>
        <button type="button" onClick={() => window.location.assign('/')}>
          Reload VoiceForge
        </button>
      </div>
    );
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node,
};
