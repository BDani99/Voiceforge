import { useEffect, useRef } from 'react';
import { Play, Pause } from 'lucide-react';
import type { Paragraph } from '../../../../types/models';
import './PlaybackControls.css';

type SegmentStatus = 'empty' | 'generated' | 'generating' | 'playing' | 'paused';

interface PlaybackControlsProps {
  handlePlayAll: () => void;
  skipToParagraph: (index: number) => void;
  paragraphs: Paragraph[];
  totalParagraphs: number;
  /** Play All is running. */
  isPlayingAll: boolean;
  /** Play All is paused. */
  isPausedAll: boolean;
  /** Any paragraph is playing (single or Play All). */
  isPlaying: boolean;
  currentPlayingIndex: number;
  generatingIndex: number;
  getAudioFor: (index: number) => HTMLAudioElement | null;
}

interface SegmentProps {
  index: number;
  status: SegmentStatus;
  /** This is the paragraph that plays or is paused. */
  current: boolean;
  running: boolean;
  getAudioFor: (index: number) => HTMLAudioElement | null;
  onSkip: (index: number) => void;
}

/** One paragraph in the bar. The current one shows how far its audio has come. */
function Segment({ index, status, current, running, getAudioFor, onSkip }: SegmentProps) {
  const progressRef = useRef<HTMLDivElement>(null);

  // The width is written straight to the element: a re-render on every frame is not needed.
  useEffect(() => {
    const element = progressRef.current;
    if (!element) return undefined;

    const show = () => {
      const audio = current ? getAudioFor(index) : null;
      const fraction = audio && audio.duration > 0 && Number.isFinite(audio.duration) ? audio.currentTime / audio.duration : 0;
      element.style.width = `${Math.min(100, fraction * 100)}%`;
    };

    show();
    if (!current || !running) return undefined;

    let frame = 0;
    const tick = () => {
      show();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [current, running, index, getAudioFor]);

  return (
    <button
      type="button"
      className={`progress-segment ${status}`}
      onClick={() => onSkip(index)}
      title={`Play from paragraph ${index + 1}`}
      aria-label={`Play from paragraph ${index + 1}${status === 'generated' ? ' (generated)' : ''}`}
      aria-current={current ? 'true' : undefined}
    >
      <span className="segment-fill" />
      <span ref={progressRef} className="segment-progress" />
    </button>
  );
}

function PlaybackControls({
  handlePlayAll,
  skipToParagraph,
  paragraphs,
  totalParagraphs,
  isPlayingAll,
  isPausedAll,
  isPlaying,
  currentPlayingIndex,
  generatingIndex,
  getAudioFor,
}: PlaybackControlsProps) {
  const playable = paragraphs.flatMap((p, i) => (p.text.trim() ? [i] : []));
  const position = playable.indexOf(currentPlayingIndex) + 1;
  const showInfo = (isPlayingAll || isPausedAll) && position > 0;

  const label = isPlayingAll ? 'Pause' : isPausedAll ? 'Resume' : 'Play All';

  return (
    <div className="playback-controls">
      <div className="playback-bar">
        <button
          type="button"
          onClick={handlePlayAll}
          disabled={totalParagraphs === 0}
          className="play-all-btn"
          aria-label={label}
        >
          {isPlayingAll ? <Pause size={20} /> : <Play size={20} />}
          <span>{label}</span>
        </button>

        <div className="playback-progress">
          {showInfo && (
            <div className="progress-info" role="status">
              {isPausedAll ? 'Paused at' : 'Playing'} paragraph {position} of {playable.length}
            </div>
          )}
          <div className="segmented-progress-bar">
            {paragraphs.map((p, index) => {
              if (!p.text.trim()) return null;

              const current = currentPlayingIndex === index;
              let status: SegmentStatus = 'empty';
              if (current && isPlaying) status = 'playing';
              else if (current && !isPlaying) status = 'paused';
              else if (generatingIndex === index) status = 'generating';
              else if (p.isGenerated) status = 'generated';

              return (
                <Segment
                  key={p.id || index}
                  index={index}
                  status={status}
                  current={current}
                  running={isPlaying}
                  getAudioFor={getAudioFor}
                  onSkip={skipToParagraph}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default PlaybackControls;
