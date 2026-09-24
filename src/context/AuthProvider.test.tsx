import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { queryMock } from '../test/queryMock';
import { AuthProvider } from './AuthProvider';
import { useAuth } from '../hooks/useAuth';

type AuthListener = (event: string, session: unknown) => void;

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  signOut: vi.fn(),
  unsubscribe: vi.fn(),
  listener: null as null | ((event: string, session: unknown) => void),
}));

vi.mock('../services/supabase', () => ({
  supabase: {
    from: mocks.from,
    auth: {
      signOut: mocks.signOut,
      onAuthStateChange: (cb: AuthListener) => {
        mocks.listener = cb;
        return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
      },
    },
  },
}));

function Probe() {
  const auth = useAuth();
  return (
    <output>
      {JSON.stringify({
        loading: auth.loading,
        signedIn: !!auth.session,
        isAdmin: auth.isAdmin,
        isBanned: auth.isBanned,
        email: auth.user?.email ?? null,
      })}
    </output>
  );
}

const session = { user: { id: 'u1', email: 'me@example.com' }, access_token: 't' };
const shown = () => JSON.parse(screen.getByRole('status').textContent) as Record<string, unknown>;
const emit = async (event: string, value: unknown) => {
  await act(async () => {
    mocks.listener?.(event, value);
    await vi.advanceTimersByTimeAsync(0);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.listener = null;
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const renderProvider = () => render(<AuthProvider><Probe /></AuthProvider>);

describe('AuthProvider', () => {
  it('is loading until Supabase reports the session', () => {
    renderProvider();
    expect(shown()).toMatchObject({ loading: true, signedIn: false });
  });

  it('reports a signed-out visitor', async () => {
    renderProvider();
    await emit('INITIAL_SESSION', null);
    expect(shown()).toEqual({ loading: false, signedIn: false, isAdmin: false, isBanned: false, email: null });
  });

  it('loads the profile of a signed-in user', async () => {
    mocks.from.mockReturnValue(queryMock({ data: { id: 'u1', role: 'user', is_banned: false, display_name: 'Me' } }).builder);
    renderProvider();

    await emit('SIGNED_IN', session);

    expect(shown()).toEqual({ loading: false, signedIn: true, isAdmin: false, isBanned: false, email: 'me@example.com' });
  });

  it('never reports "signed in without profile" while the profile is still loading (regression: login redirect loop)', async () => {
    let release: (value: unknown) => void = () => undefined;
    const pending = new Promise((resolve) => { release = resolve; });
    mocks.from.mockReturnValue(new Proxy({}, {
      get: (_t, prop) => (prop === 'then'
        ? (ok: (v: unknown) => unknown) => pending.then(() => ok({ data: { id: 'u1', role: 'admin', is_banned: false, display_name: null }, error: null }))
        : (): unknown => mocks.from() as unknown),
    }));
    renderProvider();

    await emit('SIGNED_IN', session);
    expect(shown()).toMatchObject({ loading: true, signedIn: true });

    await act(async () => {
      release(undefined);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(shown()).toMatchObject({ loading: false, isAdmin: true });
  });

  it('recognises admins by their profile role only', async () => {
    mocks.from.mockReturnValue(queryMock({ data: { id: 'u1', role: 'admin', is_banned: false, display_name: null } }).builder);
    renderProvider();
    await emit('SIGNED_IN', { ...session, user: { id: 'u1', email: 'admin@voiceforge.com' } });
    expect(shown()).toMatchObject({ isAdmin: true });

    mocks.from.mockReturnValue(queryMock({ data: { id: 'u2', role: 'user', is_banned: false, display_name: null } }).builder);
    await emit('SIGNED_IN', { ...session, user: { id: 'u2', email: 'admin@voiceforge.com' } });
    expect(shown()).toMatchObject({ isAdmin: false }); // the e-mail address means nothing
  });

  it('signs a suspended user out', async () => {
    mocks.from.mockReturnValue(queryMock({ data: { id: 'u1', role: 'user', is_banned: true, display_name: null } }).builder);
    renderProvider();

    await emit('SIGNED_IN', session);

    expect(shown()).toMatchObject({ isBanned: true });
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it('keeps the profile when only the token is refreshed', async () => {
    mocks.from.mockReturnValue(queryMock({ data: { id: 'u1', role: 'admin', is_banned: false, display_name: null } }).builder);
    renderProvider();
    await emit('SIGNED_IN', session);
    mocks.from.mockClear();

    await emit('TOKEN_REFRESHED', { ...session, access_token: 'new' });

    expect(mocks.from).not.toHaveBeenCalled();
    expect(shown()).toMatchObject({ signedIn: true, isAdmin: true, loading: false });
  });

  it('clears everything on sign-out', async () => {
    mocks.from.mockReturnValue(queryMock({ data: { id: 'u1', role: 'admin', is_banned: false, display_name: null } }).builder);
    renderProvider();
    await emit('SIGNED_IN', session);

    await emit('SIGNED_OUT', null);

    expect(shown()).toEqual({ loading: false, signedIn: false, isAdmin: false, isBanned: false, email: null });
  });

  it('stops listening when it unmounts', () => {
    const { unmount } = renderProvider();
    unmount();
    expect(mocks.unsubscribe).toHaveBeenCalled();
  });

  it('useAuth refuses to work outside the provider', () => {
    expect(() => render(<Probe />)).toThrow('useAuth must be used within an AuthProvider');
  });
});
