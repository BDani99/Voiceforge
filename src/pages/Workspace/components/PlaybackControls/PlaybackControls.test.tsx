import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PlaybackControls from './PlaybackControls';
import type { Paragraph } from '../../../../types/models';

const paragraph = (id: string, text: string, isGenerated = false): Paragraph => ({
  id, text, audioBlob: null, audioUrl: null, isGenerated, wasCached: false, emotion: '', segments: [],
});

const props = (patch: Partial<React.ComponentProps<typeof PlaybackControls>> = {}): React.ComponentProps<typeof PlaybackControls> => ({
  handlePlayAll: vi.fn(),
  skipToParagraph: vi.fn(),
  paragraphs: [paragraph('a', 'One', true), paragraph('b', 'Two'), paragraph('c', ' ')],
  totalParagraphs: 2,
  isPlayingAll: false,
  isPausedAll: false,
  isPlaying: false,
  currentPlayingIndex: -1,
  generatingIndex: -1,
  getAudioFor: () => null,
  ...patch,
});

describe('PlaybackControls', () => {
  it('offers Play All and one segment per paragraph with text', async () => {
    const p = props();
    render(<PlaybackControls {...p} />);

    expect(screen.getAllByRole('button', { name: /Play from paragraph/ })).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Play All' }));
    expect(p.handlePlayAll).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /Play from paragraph 2/ }));
    expect(p.skipToParagraph).toHaveBeenCalledWith(1);
  });

  it('is disabled without paragraphs', () => {
    render(<PlaybackControls {...props({ totalParagraphs: 0, paragraphs: [] })} />);
    expect(screen.getByRole('button', { name: 'Play All' })).toBeDisabled();
  });

  it('shows Pause and the position while Play All runs (empty paragraphs are not counted)', () => {
    render(<PlaybackControls {...props({ isPlayingAll: true, isPlaying: true, currentPlayingIndex: 1 })} />);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Playing paragraph 2 of 2');
  });

  it('shows Resume and where it stopped while paused', () => {
    render(<PlaybackControls {...props({ isPausedAll: true, currentPlayingIndex: 0 })} />);
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Paused at paragraph 1 of 2');
  });

  it('marks the current segment as playing or paused and reflects the audio position', () => {
    const audio = { currentTime: 3, duration: 12 } as HTMLAudioElement;
    const { rerender, container } = render(<PlaybackControls {...props({ isPlaying: true, currentPlayingIndex: 0, getAudioFor: (i) => (i === 0 ? audio : null) })} />);
    const [first, second] = Array.from(container.querySelectorAll('.progress-segment'));
    expect(first).toHaveClass('playing');
    expect(first).toHaveAttribute('aria-current', 'true');
    expect(second).not.toHaveClass('playing');
    expect(first?.querySelector<HTMLElement>('.segment-progress')?.style.width).toBe('25%');

    rerender(<PlaybackControls {...props({ isPlaying: false, currentPlayingIndex: 0, getAudioFor: (i) => (i === 0 ? audio : null) })} />);
    expect(container.querySelector('.progress-segment')).toHaveClass('paused');
  });

  it('shows a single playing paragraph in the bar too, without the Play All text', () => {
    const { container } = render(<PlaybackControls {...props({ isPlaying: true, currentPlayingIndex: 1 })} />);
    expect(container.querySelectorAll('.progress-segment')[1]).toHaveClass('playing');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play All' })).toBeInTheDocument();
  });

  it('marks generated and generating paragraphs', () => {
    const { container } = render(<PlaybackControls {...props({ generatingIndex: 1 })} />);
    const [first, second] = Array.from(container.querySelectorAll('.progress-segment'));
    expect(first).toHaveClass('generated');
    expect(second).toHaveClass('generating');
  });
});
