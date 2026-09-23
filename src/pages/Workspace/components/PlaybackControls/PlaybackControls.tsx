import { Play, Pause } from 'lucide-react';
import type { Paragraph } from '../../../../types/models';
import './PlaybackControls.css';

interface PlaybackControlsProps {
  handlePlayAll: () => void;
  skipToParagraph: (index: number) => void;
  paragraphs: Paragraph[];
  totalParagraphs: number;
  isPlayingAll: boolean;
  currentPlayingIndex: number;
  generatingIndex: number;
}

function PlaybackControls({
  handlePlayAll,
  skipToParagraph,
  paragraphs,
  totalParagraphs,
  isPlayingAll,
  currentPlayingIndex,
  generatingIndex
}: PlaybackControlsProps) {
  return (
    <div className="playback-controls">
      <div className="playback-bar">
        <button
          onClick={handlePlayAll}
          disabled={totalParagraphs === 0}
          className="play-all-btn"
        >
          {isPlayingAll ? (
            <>
              <Pause size={20} />
              <span>Stop</span>
            </>
          ) : (
            <>
              <Play size={20} />
              <span>Play All</span>
            </>
          )}
        </button>

        <div className="playback-progress">
          {isPlayingAll && (
            <div className="progress-info">
              Playing paragraph {currentPlayingIndex + 1} of {totalParagraphs}
            </div>
          )}
          <div className="segmented-progress-bar">
            {paragraphs.map((p, index) => {
              if (!p.text.trim()) return null;

              const isPlaying = isPlayingAll && currentPlayingIndex === index;
              const isGenerating = generatingIndex === index;
              const isGenerated = p.isGenerated;

              let statusClass = 'empty';
              if (isPlaying) statusClass = 'playing';
              else if (isGenerating) statusClass = 'generating';
              else if (isGenerated) statusClass = 'generated';

              return (
                <div
                  key={index}
                  className={`progress-segment ${statusClass}`}
                  onClick={() => skipToParagraph(index)}
                  title={`Skip to Paragraph ${index + 1}`}
                >
                  <div className="segment-fill"></div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}


export default PlaybackControls;
