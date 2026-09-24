import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Auth from './Auth';
import type * as NotificationService from '../../utils/notificationService';

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  auth: { session: null as { access_token: string } | null, loading: false },
  notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('../../services/supabase', () => ({
  supabase: { auth: { signInWithPassword: mocks.signIn, signUp: mocks.signUp } },
}));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => mocks.auth }));
vi.mock('../../utils/notificationService', async (importOriginal) => ({
  ...(await importOriginal<typeof NotificationService>()),
  notify: mocks.notify,
}));

const renderAuth = () => {
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<Auth />} />
        <Route path="/projects" element={<p>projects page</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
};

/** Breach service answers: no match by default. */
const stubBreachCheck = (body = 'ABCDEF:1') =>
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(body) }));

async function switchToRegister(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText(/Don't have an account/));
}

async function fillRegistration(user: ReturnType<typeof userEvent.setup>, password: string, confirm = password) {
  await user.type(screen.getByLabelText('Email'), 'new@example.com');
  await user.type(screen.getByLabelText('Password'), password);
  await user.type(screen.getByLabelText('Confirm Password'), confirm);
  await user.click(screen.getByRole('button', { name: 'Register' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth = { session: null, loading: false };
  stubBreachCheck();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('login', () => {
  it('signs in and continues to the app', async () => {
    mocks.signIn.mockResolvedValue({ error: null });
    const user = renderAuth();

    await user.type(screen.getByLabelText('Email'), 'me@example.com');
    await user.type(screen.getByLabelText('Password'), 'secret-pass');
    await user.click(screen.getByRole('button', { name: 'Login' }));

    expect(mocks.signIn).toHaveBeenCalledWith({ email: 'me@example.com', password: 'secret-pass' });
    expect(await screen.findByText('projects page')).toBeInTheDocument();
  });

  it('shows a friendly message for wrong credentials', async () => {
    mocks.signIn.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    const user = renderAuth();

    await user.type(screen.getByLabelText('Email'), 'me@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Login' }));

    expect(await screen.findByText('Incorrect email or password. Please try again.')).toBeInTheDocument();
    expect(mocks.notify.error).toHaveBeenCalled();
    expect(screen.queryByText('projects page')).not.toBeInTheDocument();
  });

  it('skips the form when already signed in', () => {
    mocks.auth = { session: { access_token: 't' }, loading: false };
    renderAuth();
    expect(screen.getByText('projects page')).toBeInTheDocument();
  });

  it('can reveal and hide the password', async () => {
    const user = renderAuth();
    const field = screen.getByLabelText('Password');
    expect(field).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(field).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(field).toHaveAttribute('type', 'password');
  });
});

describe('registration', () => {
  it('rejects mismatching passwords without contacting the server', async () => {
    const user = renderAuth();
    await switchToRegister(user);
    await fillRegistration(user, 'Abcdefg1', 'Abcdefg2');

    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it('rejects short and weak passwords', async () => {
    const user = renderAuth();
    await switchToRegister(user);

    await fillRegistration(user, 'short');
    expect(await screen.findByText('Password must be at least 8 characters.')).toBeInTheDocument();
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it('rejects passwords found in a known data breach', async () => {
    // SHA-1("Password1") = 70CCD9007338D6D81DD3B6271621B9CF9A97EA00
    stubBreachCheck('9007338D6D81DD3B6271621B9CF9A97EA00:52256');
    const user = renderAuth();
    await switchToRegister(user);
    await fillRegistration(user, 'Password1');

    expect(await screen.findByText(/known data breach/)).toBeInTheDocument();
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it('registers and welcomes the user when no e-mail confirmation is required', async () => {
    mocks.signUp.mockResolvedValue({ data: { session: { access_token: 't' }, user: { identities: [{}] } }, error: null });
    const user = renderAuth();
    await switchToRegister(user);
    await user.type(screen.getByLabelText('Display Name'), 'Newbie');
    await fillRegistration(user, 'Abcdefg1');

    await waitFor(() => expect(mocks.notify.success).toHaveBeenCalledWith('Account created. Welcome to VoiceForge!'));
    expect(mocks.signUp).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'Abcdefg1',
      options: { data: { display_name: 'Newbie' } },
    });
  });

  it('asks the user to confirm their e-mail when Supabase requires it', async () => {
    mocks.signUp.mockResolvedValue({ data: { session: null, user: { identities: [{}] } }, error: null });
    const user = renderAuth();
    await switchToRegister(user);
    await fillRegistration(user, 'Abcdefg1');

    await waitFor(() => expect(mocks.notify.success).toHaveBeenCalledWith(expect.stringContaining('Check your e-mail')));
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument(); // back on the login form
  });

  it('reports an address that is already registered', async () => {
    mocks.signUp.mockResolvedValue({ data: { session: null, user: { identities: [] } }, error: null });
    const user = renderAuth();
    await switchToRegister(user);
    await fillRegistration(user, 'Abcdefg1');

    expect(await screen.findByText('An account with this email already exists.')).toBeInTheDocument();
  });

  it('still lets people register when the breach service is unreachable (fails open)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    mocks.signUp.mockResolvedValue({ data: { session: { access_token: 't' }, user: { identities: [{}] } }, error: null });
    const user = renderAuth();
    await switchToRegister(user);
    await fillRegistration(user, 'Abcdefg1');

    await waitFor(() => expect(mocks.signUp).toHaveBeenCalled());
  });
});
