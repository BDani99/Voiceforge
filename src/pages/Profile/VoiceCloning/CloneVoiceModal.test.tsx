import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CloneVoiceModal from './CloneVoiceModal';
import type { VoiceCloningApi } from '../../../hooks/useVoiceCloning';

// Keeps this file free of real network calls; the hook itself is tested on its own.
vi.mock('../../../hooks/useVoiceCloneCost', () => ({ useVoiceCloneCost: () => 5000, DEFAULT_VOICE_CLONE_COST: 5000 }));

class FakeRecorder {
  static instances: FakeRecorder[] = [];
  static isTypeSupported = vi.fn(() => true);
  state: 'inactive' | 'recording' = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onerror: (() => void) | null = null;
  onstop: (() => void) | null = null;
  constructor() {
    FakeRecorder.instances.push(this);
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['chunk']) });
    this.onstop?.();
  }
}

const api = (patch: Partial<VoiceCloningApi> = {}): VoiceCloningApi => ({
  voices: [],
  loading: false,
  busy: false,
  startConsent: vi.fn().mockResolvedValue({ id: 'chal_1', phrase: 'The quick brown fox jumps', expiresAt: null }),
  create: vi.fn().mockResolvedValue(null),
  remove: vi.fn(),
  ...patch,
});

const recordAClip = async (name: string) => {
  await userEvent.click(screen.getByRole('button', { name }));
  await userEvent.click(screen.getByRole('button', { name: /^Stop/ }));
};

beforeEach(() => {
  FakeRecorder.instances = [];
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) } });
  URL.createObjectURL = vi.fn(() => 'blob:fake');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const fillSampleStep = async (cloning: VoiceCloningApi) => {
  render(<CloneVoiceModal isOpen onClose={vi.fn()} cloning={cloning} />);
  await userEvent.type(screen.getByLabelText('Voice name'), 'My Narrator');
  await userEvent.type(screen.getByLabelText("Speaker's full name"), 'Jane Doe');
  await recordAClip('Record');
  await userEvent.click(screen.getByRole('button', { name: 'Continue to consent' }));
};

describe('CloneVoiceModal', () => {
  it('renders nothing while closed', () => {
    render(<CloneVoiceModal isOpen={false} onClose={vi.fn()} cloning={api()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the current cloning cost', () => {
    render(<CloneVoiceModal isOpen onClose={vi.fn()} cloning={api()} />);
    expect(screen.getByText(/costs 5,000 credits/)).toBeInTheDocument();
  });

  it('disables Continue until a name, a speaker and a sample are given', async () => {
    render(<CloneVoiceModal isOpen onClose={vi.fn()} cloning={api()} />);
    const submit = screen.getByRole('button', { name: 'Continue to consent' });
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Voice name'), 'My Narrator');
    await userEvent.type(screen.getByLabelText("Speaker's full name"), 'Jane Doe');
    expect(submit).toBeDisabled(); // still no sample

    await recordAClip('Record');
    expect(submit).toBeEnabled();
  });

  it('goes to the consent step with the phrase from the challenge', async () => {
    const cloning = api();
    await fillSampleStep(cloning);

    expect(cloning.startConsent).toHaveBeenCalledWith('Jane Doe');
    expect(screen.getByRole('note')).toHaveTextContent('The quick brown fox jumps');
    expect(screen.getByRole('button', { name: 'Create voice' })).toBeDisabled();
  });

  it('creates the voice once the consent recording exists, with the right fields', async () => {
    const onClose = vi.fn();
    const cloning = api();
    render(<CloneVoiceModal isOpen onClose={onClose} cloning={cloning} />);
    await userEvent.type(screen.getByLabelText('Voice name'), 'My Narrator');
    await userEvent.type(screen.getByLabelText("Speaker's full name"), 'Jane Doe');
    await recordAClip('Record');
    await userEvent.click(screen.getByRole('button', { name: 'Continue to consent' }));

    await recordAClip('Record');
    await userEvent.click(screen.getByRole('button', { name: 'Create voice' }));

    expect(cloning.create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'My Narrator',
      consentChallengeId: 'chal_1',
      gender: 'not_specified',
    }));
    const create = cloning.create as unknown as ReturnType<typeof vi.fn<VoiceCloningApi['create']>>;
    const call = create.mock.calls[0]?.[0];
    expect(call?.sample).toBeInstanceOf(Blob);
    expect(call?.consentRecording).toBeInstanceOf(Blob);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows a failure and offers to get a new phrase without losing the sample', async () => {
    const cloning = api({ create: vi.fn().mockResolvedValue('The recording did not match the phrase.') });
    await fillSampleStep(cloning);
    await recordAClip('Record');
    await userEvent.click(screen.getByRole('button', { name: 'Create voice' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/did not match the phrase/);

    await userEvent.click(screen.getByRole('button', { name: 'Get a new phrase' }));
    expect(cloning.startConsent).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('note')).toBeInTheDocument(); // back on the consent step
  });

  it('"Start over" clears the form back to the first step', async () => {
    const cloning = api({ create: vi.fn().mockResolvedValue('failed') });
    await fillSampleStep(cloning);
    await recordAClip('Record');
    await userEvent.click(screen.getByRole('button', { name: 'Create voice' }));
    await userEvent.click(screen.getByRole('button', { name: 'Start over' }));

    expect(screen.getByLabelText('Voice name')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Continue to consent' })).toBeDisabled();
  });

  it('lets a file be uploaded instead of recorded', async () => {
    render(<CloneVoiceModal isOpen onClose={vi.fn()} cloning={api()} />);
    const file = new File(['audio-bytes'], 'voice.wav', { type: 'audio/wav' });
    await userEvent.upload(screen.getByLabelText('Upload a voice sample file'), file);
    expect(screen.getByText('voice.wav')).toBeInTheDocument();
    expect(FakeRecorder.instances).toHaveLength(0);
  });

  it('closes on cancel, but not while a request is in flight', async () => {
    const onClose = vi.fn();
    let resolveCreate: (v: string | null) => void = () => undefined;
    const cloning = api({ create: vi.fn().mockReturnValue(new Promise((resolve) => { resolveCreate = resolve; })) });
    render(<CloneVoiceModal isOpen onClose={onClose} cloning={cloning} />);
    await userEvent.type(screen.getByLabelText('Voice name'), 'My Narrator');
    await userEvent.type(screen.getByLabelText("Speaker's full name"), 'Jane Doe');
    await recordAClip('Record');
    await userEvent.click(screen.getByRole('button', { name: 'Continue to consent' }));
    await recordAClip('Record');
    await userEvent.click(screen.getByRole('button', { name: 'Create voice' }));

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).not.toHaveBeenCalled();

    resolveCreate(null);
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
