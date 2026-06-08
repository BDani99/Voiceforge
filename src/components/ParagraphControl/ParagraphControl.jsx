import React, { useRef, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Play, Pause, Loader2, Mic, Check, Volume2 } from 'lucide-react';
import audioCrossfader from '../../utils/audioCrossfader';
import './ParagraphControl.css';

/**
 * Enhanced Paragraph component with fade support, smart cache UI, and micro-preview
 */
function ParagraphControl({
  paragraph,
  index,
  onUpdate,
  onPlay,
  onGenerate,
  onPreview,
  onSplitText,
  isPlaying,
  isGenerating,
  isGenerated,
  globalDefaults,
  currentEmotion,
  isFirstParagraph = false,
  useFadeTransitions = true,
  globalAudio,
  isPlayingAll,
  currentPlayingIndex,
  stopGlobalPlay
}) {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [selection, setSelection] = useState('');
  const [isPreviewing, setIsPreviewing] = useState(false);
  const textareaRef = useRef(null);

  // Update progress smoothly using globalAudio
  useEffect(() => {
    let animationFrameId;
    
    const updateProgress = () => {
      if (isPlaying && globalAudio) {
        const audio = globalAudio();
        if (audio) {
          setCurrentTime(audio.currentTime);
          if (audio.duration && audio.duration !== Infinity) {
            setDuration(audio.duration);
          }
        }
        animationFrameId = requestAnimationFrame(updateProgress);
      }
    };

    if (isPlaying) {
      updateProgress();
    }

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [isPlaying, globalAudio]);

  const handlePlayPause = async () => {
    if (isGenerated && (paragraph.audioBlob || paragraph.audioUrl)) {
      onPlay(index);
    } else if (!isGenerating) {
      // If not generated, generate it first, then play
      const newBlob = await onGenerate(index, false);
      if (newBlob) {
        // Wait a small tick to ensure state is updated before playing
        setTimeout(() => {
          onPlay(index);
        }, 100);
      }
    }
  };

  const handleSeek = (e) => {
    const targetAudio = globalAudio ? globalAudio() : null;
    if (!targetAudio || !duration) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    targetAudio.currentTime = pos * duration;
    setCurrentTime(pos * duration);
  };

  const formatTime = (secs) => {
    if (isNaN(secs) || !isFinite(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleTextChange = (newText) => {
    if (isFirstParagraph && newText.includes('\n')) {
      onSplitText(newText);
    } else {
      onUpdate(index, 'text', newText);
    }
    setSelection(''); // clear selection on edit
  };

  const handleMouseUp = () => {
    if (textareaRef.current) {
      const start = textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      if (start !== end) {
        const selectedStr = paragraph.text.substring(start, end).trim();
        if (selectedStr.length > 0 && selectedStr.length < 150) {
          // Only show for short selections to avoid huge preview costs
          setSelection(selectedStr);
        } else {
          setSelection('');
        }
      } else {
        setSelection('');
      }
    }
  };

  const handlePreview = async () => {
    if (!selection) return;
    if (onPreview) {
      setIsPreviewing(true);
      await onPreview(selection);
      setIsPreviewing(false);
      setSelection(''); // hide after playing
    }
  };

  const getGlobalPitchDisplay = () => {
    return globalDefaults.usePitchCustom
      ? `${globalDefaults.pitchCustom >= 0 ? '+' : ''}${globalDefaults.pitchCustom}%`
      : globalDefaults.pitch;
  };

  const getGlobalRateDisplay = () => {
    return globalDefaults.useRateCustom
      ? `${globalDefaults.rateCustom >= 0 ? '+' : ''}${globalDefaults.rateCustom}%`
      : globalDefaults.rate;
  };

  const getGlobalVolumeDisplay = () => {
    return globalDefaults.useVolumeCustom
      ? `${globalDefaults.volumeCustom >= 0 ? '+' : ''}${globalDefaults.volumeCustom}%`
      : globalDefaults.volume;
  };

  return (
    <div className={`paragraph-box ${isPlaying ? 'playing' : ''} ${isGenerated ? 'generated' : ''}`}>
      <div className="paragraph-controls-bar">
        <div className="paragraph-info">
          <span className="paragraph-number">#{index + 1}</span>
          <span className="paragraph-chars">{paragraph.text.length} chars</span>
          {isGenerated && <Check size={16} className="status-icon success" />}
          {paragraph.wasCached && <span className="cache-badge">Gyorsítótárazva (0 kredit)</span>}
        </div>

        <div className="global-settings-display">
          <span className="setting-display">
            Pitch: <strong>{getGlobalPitchDisplay()}</strong>
          </span>
          <span className="setting-display">
            Speed: <strong>{getGlobalRateDisplay()}</strong>
          </span>
          <span className="setting-display">
            Volume: <strong>{getGlobalVolumeDisplay()}</strong>
          </span>
          {currentEmotion && (
            <span className="setting-display">
              Emotion: <strong>{currentEmotion}</strong>
            </span>
          )}
        </div>

        <div className="paragraph-actions">
          <button
            onClick={() => onGenerate(index, true)} // Force regenerate
            disabled={isGenerating || !paragraph.text.trim()}
            className="para-btn generate-btn"
            title="Generate/Regenerate audio"
          >
            {isGenerating ? <Loader2 size={18} className="spinning loader-icon" /> : <Mic size={18} />}
          </button>
          <button
            onClick={handlePlayPause}
            disabled={isGenerating || !paragraph.text.trim()}
            className="para-btn play-btn"
            title={isGenerated ? (isPlaying ? "Pause" : "Play/Resume") : "Generate and Play"}
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>
        </div>
      </div>

      <div className="paragraph-text">
        {selection && (
          <button className="preview-popup" onClick={handlePreview} disabled={isPreviewing}>
            {isPreviewing ? <Loader2 size={14} className="spinning" /> : <Volume2 size={14} />}
            Play Preview
          </button>
        )}
        <textarea
          ref={textareaRef}
          value={paragraph.text}
          onChange={(e) => handleTextChange(e.target.value)}
          onMouseUp={handleMouseUp}
          onKeyUp={handleMouseUp}
          className="paragraph-textarea"
          rows="4"
          placeholder={isFirstParagraph ? "Paste your text here. Multiple paragraphs will be automatically split..." : "Enter paragraph text..."}
        />
        
        {/* Local Progress Bar */}
        {(isGenerated || isGenerating) && (
          <div className="local-timeline-container">
            <div className="local-time">{formatTime(currentTime)}</div>
            <div className="local-progress-bar-wrapper" onClick={handleSeek}>
              <div className="local-progress-bg">
                <div 
                  className="local-progress-fill" 
                  style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                />
              </div>
            </div>
            <div className="local-time">{formatTime(duration)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

ParagraphControl.propTypes = {
  paragraph: PropTypes.shape({
    text: PropTypes.string.isRequired,
    audioBlob: PropTypes.instanceOf(Blob),
    isGenerated: PropTypes.bool.isRequired,
    wasCached: PropTypes.bool,
  }).isRequired,
  index: PropTypes.number.isRequired,
  onUpdate: PropTypes.func.isRequired,
  onPlay: PropTypes.func.isRequired,
  onGenerate: PropTypes.func.isRequired,
  onPreview: PropTypes.func,
  onSplitText: PropTypes.func.isRequired,
  isPlaying: PropTypes.bool.isRequired,
  isGenerating: PropTypes.bool.isRequired,
  isGenerated: PropTypes.bool.isRequired,
  globalDefaults: PropTypes.shape({
    pitch: PropTypes.string,
    pitchCustom: PropTypes.number,
    usePitchCustom: PropTypes.bool,
    rate: PropTypes.string,
    rateCustom: PropTypes.number,
    useRateCustom: PropTypes.bool,
    volume: PropTypes.string,
    volumeCustom: PropTypes.number,
    useVolumeCustom: PropTypes.bool,
  }).isRequired,
  currentEmotion: PropTypes.string,
  isFirstParagraph: PropTypes.bool,
  useFadeTransitions: PropTypes.bool,
};

export default ParagraphControl;
