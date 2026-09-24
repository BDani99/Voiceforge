import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import type { AuthContextValue } from '../context/authContext';

const authState = vi.hoisted(() => ({ current: {} as AuthContextValue }));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => authState.current }));

const state = (overrides: Partial<AuthContextValue>): AuthContextValue => ({
  session: null,
  profile: null,
  loading: false,
  user: null,
  isAdmin: false,
  isBanned: false,
  ...overrides,
});

const signedIn = { access_token: 't' } as unknown as AuthContextValue['session'];

function renderAt(path: string, adminOnly = false) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<p>login page</p>} />
        <Route path="/admin/login" element={<p>admin login page</p>} />
        <Route path="/projects" element={<p>projects page</p>} />
        <Route path="/admin/dashboard" element={<p>admin dashboard</p>} />
        <Route path="/secret" element={<ProtectedRoute adminOnly={adminOnly}><p>secret</p></ProtectedRoute>} />
        <Route path="/admin/secret" element={<ProtectedRoute adminOnly={adminOnly}><p>admin secret</p></ProtectedRoute>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    authState.current = state({});
  });

  it('shows a loading state until the session is known', () => {
    authState.current = state({ loading: true });
    renderAt('/secret');
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('login page')).not.toBeInTheDocument();
  });

  it('sends visitors without a session to the login page', () => {
    renderAt('/secret');
    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('sends visitors of admin routes to the admin login', () => {
    renderAt('/admin/secret', true);
    expect(screen.getByText('admin login page')).toBeInTheDocument();
  });

  it('shows the page to a signed-in user', () => {
    authState.current = state({ session: signedIn });
    renderAt('/secret');
    expect(screen.getByText('secret')).toBeInTheDocument();
  });

  it('treats a suspended user like a signed-out one', () => {
    authState.current = state({ session: signedIn, isBanned: true });
    renderAt('/secret');
    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('keeps non-admins out of admin routes', () => {
    authState.current = state({ session: signedIn });
    renderAt('/admin/secret', true);
    expect(screen.getByText('projects page')).toBeInTheDocument();
  });

  it('lets admins into admin routes', () => {
    authState.current = state({ session: signedIn, isAdmin: true });
    renderAt('/admin/secret', true);
    expect(screen.getByText('admin secret')).toBeInTheDocument();
  });

  it('keeps admins in the admin area', () => {
    authState.current = state({ session: signedIn, isAdmin: true });
    renderAt('/secret');
    expect(screen.getByText('admin dashboard')).toBeInTheDocument();
  });
});
