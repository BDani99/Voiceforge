import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ParagraphControl from './ParagraphControl';
import { DEFAULT_GLOBAL_DEFAULTS } from '../../../../constants/voiceConstants';
import type { Paragraph } from '../../../../types/models';
import type { PlaybackSource } from '../../../../types/playback';

vi.mock('../../../../hooks/useBlobDuration', () => ({ useBlobDuration: () => 0 }));

const paragraph = (patch: Partial<Paragraph> = {}): Paragraph => ({
  id: 'p1', text: 'Hello brave new world', audioBlob: null, audioUrl: null, isGenerated: false, wasCached: false,
  emotion: '', segments: [], marks: [], speechMarks: null, ...patch,
});

const setup = (props: Partial<React.ComponentProps<typeof ParagraphControl>> = {}) => {
  const all = {
    paragraph: paragraph(),
    index: 0,
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
    onPlay: vi.fn(),
    onGenerate: vi.fn().mockResolvedValue(null),
    onSplitText: vi.fn(),
    isPlaying: false,
    isGenerating: false,
    isGenerated: false,
    globalDefaults: DEFAULT_GLOBAL_DEFAULTS,
    defaultEmotion: '',
    emotionSupported: true,
    onSetEmotion: vi.fn(),
    onApplyEmotionToRange: vi.fn(),
    onClearEmotionRange: vi.fn(),
    onClearHighlights: vi.fn(),
    onApplyMark: vi.fn(),
    onClearMarks: vi.fn(),
    onClearAllMarks: vi.fn(),
    ...props,
  };
  const view = render(<ParagraphControl {...all} />);
  return { ...view, props: all };
};

let frames: FrameRequestCallback[] = [];

beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const source = (currentTime: number, duration = 10): PlaybackSource => ({ currentTime, duration, pause: vi.fn(), play: vi.fn(() => Promise.resolve()) });

describe('ParagraphControl playback controls', () => {
  it('plays through the hook, also for audio that has to be generated first', async () => {
    const { props } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Generate and Play' }));
    expect(props.onPlay).toHaveBeenCalledWith(0);
  });

  it('is locked while the audio is generated, except when it is streamed (then it can be paused)', () => {
    const { rerender, props } = setup({ isGenerating: true });
    expect(screen.getByRole('button', { name: /Generate and Play/ })).toBeDisabled();

    rerender(<ParagraphControl {...props} isGenerating isStreaming isPlaying />);
    expect(screen.getByRole('button', { name: /Generate and Play/ })).toBeEnabled();
    expect(screen.getByText('live')).toBeInTheDocument();
  });
});

describe('ParagraphControl position and karaoke', () => {
  const generated = paragraph({
    isGenerated: true,
    audioBlob: new Blob(['a']),
    speechMarks: { durationMs: 2000, words: [[0, 5, 0, 500], [6, 11, 600, 1100], [12, 15, 1200, 1500], [16, 21, 1600, 2000]] },
  });

  it('highlights the word being spoken from the position of its own audio', () => {
    const audio = source(0.7);
    const { container, rerender, props } = setup({ paragraph: generated, isGenerated: true, isPlaying: true, isActive: true, getAudio: () => audio });
    expect(container.querySelector('.et__now')).toHaveTextContent('brave');

    audio.currentTime = 1.65;
    act(() => { frames.splice(0).forEach((cb) => cb(0)); });
    expect(container.querySelector('.et__now')).toHaveTextContent('world');

    // stopped: nothing is highlighted
    rerender(<ParagraphControl {...props} paragraph={generated} isGenerated getAudio={() => null} isPlaying={false} isActive={false} />);
    expect(container.querySelector('.et__now')).toBeNull();
  });

  it('shows no highlight for audio without timings', () => {
    const { container } = setup({ paragraph: { ...generated, speechMarks: null }, isGenerated: true, isPlaying: true, isActive: true, getAudio: () => source(0.7) });
    expect(container.querySelector('.et__now')).toBeNull();
  });

  it('shows the time of its own audio and seeks it by click and keys', async () => {
    const onSeek = vi.fn();
    setup({ paragraph: generated, isGenerated: true, isActive: true, getAudio: () => source(4, 10), onSeek });

    const bar = screen.getByRole('slider', { name: 'Position in paragraph 1' });
    expect(bar).toHaveAttribute('aria-valuetext', '0:04 of 0:10');

    bar.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onSeek).toHaveBeenLastCalledWith(0, 0.9); // 4 s + 5 s of 10 s
    await userEvent.keyboard('{ArrowLeft}');
    // ArrowRight moved the shown position to 9 s (0.9 * 10); ArrowLeft steps 5 s back from there, to 4 s.
    expect(onSeek).toHaveBeenLastCalledWith(0, 0.4);
  });
});
