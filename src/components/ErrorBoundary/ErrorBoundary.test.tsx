import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary';

function Broken(): never {
  throw new Error('render failed');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('renders its children normally', () => {
    render(<ErrorBoundary><p>all good</p></ErrorBoundary>);
    expect(screen.getByText('all good')).toBeInTheDocument();
  });

  it('shows a recovery screen and logs the error when a child crashes', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(<ErrorBoundary><Broken /></ErrorBoundary>);

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.getByRole('button', { name: 'Reload VoiceForge' })).toBeInTheDocument();
    expect(logged).toHaveBeenCalledWith('Unhandled render error:', expect.any(Error), expect.any(String));
  });
});
