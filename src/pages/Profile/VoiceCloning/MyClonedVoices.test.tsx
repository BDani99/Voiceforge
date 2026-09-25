import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MyClonedVoices from './MyClonedVoices';
import type { VoiceCloningApi } from '../../../hooks/useVoiceCloning';
import type { ClonedVoice } from '../../../services/voiceCloning';

const voice = (id: string, patch: Partial<ClonedVoice> = {}): ClonedVoice => ({
  id, user_id: 'u1', speechify_voice_id: `sf_${id}`, display_name: id, gender: 'female', locale: 'en-US',
  consent_challenge_id: 'c', created_at: '2026-09-01T10:00:00Z', ...patch,
});

const api = (patch: Partial<VoiceCloningApi> = {}): VoiceCloningApi => ({
  voices: [voice('a')],
  loading: false,
  busy: false,
  startConsent: vi.fn(),
  create: vi.fn(),
  remove: vi.fn().mockResolvedValue(undefined),
  ...patch,
});

describe('MyClonedVoices', () => {
  it('shows a loading state', () => {
    render(<MyClonedVoices cloning={api({ loading: true, voices: [] })} />);
    expect(screen.getByText(/Loading your voices/)).toBeInTheDocument();
  });

  it('shows an empty state', () => {
    render(<MyClonedVoices cloning={api({ voices: [] })} />);
    expect(screen.getByText(/have not cloned any voices/)).toBeInTheDocument();
  });

  it('lists voices with their details', () => {
    render(<MyClonedVoices cloning={api({ voices: [voice('a', { gender: 'male', locale: 'de-DE' })] })} />);
    const item = screen.getByRole('listitem');
    expect(within(item).getByText('a')).toBeInTheDocument();
    expect(item).toHaveTextContent('Male');
    expect(item).toHaveTextContent('de-DE');
  });

  it('asks for confirmation before deleting, and does nothing when cancelled', async () => {
    const cloning = api();
    render(<MyClonedVoices cloning={cloning} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete a' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent(/Delete "a"/);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(cloning.remove).not.toHaveBeenCalled();
  });

  it('deletes the voice once confirmed', async () => {
    const cloning = api();
    render(<MyClonedVoices cloning={cloning} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete a' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete voice' }));
    expect(cloning.remove).toHaveBeenCalledWith('a');
  });

  it('opens the clone wizard', async () => {
    render(<MyClonedVoices cloning={api()} />);
    await userEvent.click(screen.getByRole('button', { name: /Clone a new voice/ }));
    expect(screen.getByRole('dialog', { name: 'Clone a voice' })).toBeInTheDocument();
  });
});
