import React, { useRef } from 'react';
import PropTypes from 'prop-types';
import { Play, Pause, Music, Volume2, Upload } from 'lucide-react';
import './PlaybackControls.css';

function PlaybackControls({
  handlePlayAll,
  skipToParagraph,
  paragraphs,
  totalParagraphs,
  isPlayingAll,
  currentPlayingIndex,
  generatingIndex,
  bgmFileName,
  bgmVolume,
  handleBgmUpload,
  handleBgmVolumeChange
}) {
  const fileInputRef = useRef(null);

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

        <div className="bgm-controls">
          <div className="bgm-upload" onClick={() => fileInputRef.current?.click()} title={bgmFileName ? `BGM: ${bgmFileName}` : 'Upload Background Music'}>
            <Music size={18} className={bgmFileName ? 'active-icon' : ''} />
            <input 
              type="file" 
              accept="audio/*" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              onChange={handleBgmUpload} 
            />
          </div>
          {bgmFileName && (
            <div className="bgm-volume">
              <Volume2 size={16} />
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.01" 
                value={bgmVolume} 
                onChange={handleBgmVolumeChange} 
                title="BGM Volume"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

PlaybackControls.propTypes = {
  handlePlayAll: PropTypes.func.isRequired,
  skipToParagraph: PropTypes.func.isRequired,
  paragraphs: PropTypes.array.isRequired,
  totalParagraphs: PropTypes.number.isRequired,
  isPlayingAll: PropTypes.bool.isRequired,
  currentPlayingIndex: PropTypes.number.isRequired,
  generatingIndex: PropTypes.number.isRequired,
  bgmFileName: PropTypes.string,
  bgmVolume: PropTypes.number,
  handleBgmUpload: PropTypes.func,
  handleBgmVolumeChange: PropTypes.func
};

export default PlaybackControls;
