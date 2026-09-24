import { useRef, useEffect, useState, type MouseEvent } from 'react';
import { Play, Pause, Loader2, Mic, Check, Trash2 } from 'lucide-react';
import type { GlobalDefaults, Paragraph } from '../../../../types/models';
import type { EmotionSegment } from '../../../../utils/emotionSegments';
import EmotionTextarea, { type TextRange } from './EmotionTextarea';
import { EmotionToolbar, HighlightList, ParagraphEmotionSelect } from './EmotionControls';
import './ParagraphControl.css';

interface ParagraphControlProps {
  paragraph: Paragraph;
  index: number;
  onUpdate: (index: number, text: string) => void;
  onDelete: (index: number) => void;
  onPlay: (index: number) => void | Promise<void>;
  onGenerate: (index: number, forceRegenerate?: boolean) => Promise<Blob | null>;
  onPreview?: (text: string) => Promise<void>;
  onSplitText: (text: string) => void;
  isPlaying: boolean;
  isGenerating: boolean;
  isGenerated: boolean;
  globalDefaults: GlobalDefaults;
  /** Emotion that applies to paragraphs without their own setting. */
  defaultEmotion: string;
  /** Whether the model in use supports emotions. */
  emotionSupported: boolean;
  onSetEmotion: (index: number, emotion: string) => void;
  onApplyEmotionToRange: (index: number, start: number, end: number, emotion: string) => void;
  onClearEmotionRange: (index: number, start: number, end: number) => void;
  onClearHighlights: (index: number) => void;
  isFirstParagraph?: boolean;
  /** Returns the audio element that is currently playing, if any. */
  globalAudio?: () => HTMLAudioElement | null;
}

const percent = (value: number): string => `${value >= 0 ? '+' : ''}${value}%`;

/** One text block: emotions, generate/play/delete controls, a progress bar and a selection preview. */
function ParagraphControl({
  paragraph,
  index,
  onUpdate,
  onDelete,
  onPlay,
  onGenerate,
  onPreview,
  onSplitText,
  isPlaying,
  isGenerating,
  isGenerated,
  globalDefaults,
  defaultEmotion,
  emotionSupported,
  onSetEmotion,
  onApplyEmotionToRange,
  onClearEmotionRange,
  onClearHighlights,
  isFirstParagraph = false,
  globalAudio,
}: ParagraphControlProps) {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [range, setRange] = useState<TextRange | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Update progress smoothly using globalAudio
  useEffect(() => {
    let animationFrameId: number | undefined;

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
      void onPlay(index);
    } else if (!isGenerating) {
      // If not generated, generate it first, then play
      const newBlob = await onGenerate(index, false);
      if (newBlob) {
        // Wait a small tick to ensure state is updated before playing
        setTimeout(() => {
          void onPlay(index);
        }, 100);
      }
    }
  };

  const handleSeek = (e: MouseEvent<HTMLDivElement>) => {
    const targetAudio = globalAudio ? globalAudio() : null;
    if (!targetAudio || !duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    targetAudio.currentTime = pos * duration;
    setCurrentTime(pos * duration);
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || !isFinite(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleTextChange = (newText: string) => {
    if (isFirstParagraph && newText.includes('\n')) {
      onSplitText(newText);
    } else {
      onUpdate(index, newText);
    }
    setRange(null); // positions changed
  };

  const applyEmotion = (emotion: string) => {
    if (!range) return;
    onApplyEmotionToRange(index, range.start, range.end, emotion);
    setRange(null);
  };

  const selectedText = range ? paragraph.text.slice(range.start, range.end).trim() : '';

  const handlePreview = async () => {
    if (!selectedText || !onPreview) return;
    setIsPreviewing(true);
    try {
      await onPreview(selectedText);
    } finally {
      setIsPreviewing(false);
    }
  };

  const removeSegment = (segment: EmotionSegment) => onClearEmotionRange(index, segment.start, segment.end);

  const pitch = globalDefaults.usePitchCustom ? percent(globalDefaults.pitchCustom) : globalDefaults.pitch;
  const rate = globalDefaults.useRateCustom ? percent(globalDefaults.rateCustom) : globalDefaults.rate;
  const volume = globalDefaults.useVolumeCustom ? percent(globalDefaults.volumeCustom) : globalDefaults.volume;

  return (
    <div className={`paragraph-box ${isPlaying ? 'playing' : ''} ${isGenerated ? 'generated' : ''}`}>
      <div className="paragraph-controls-bar">
        <div className="paragraph-info">
          <span className="paragraph-number">#{index + 1}</span>
          <span className="paragraph-chars">{paragraph.text.length} chars</span>
          {isGenerated && <Check size={16} className="status-icon success" />}
          {paragraph.wasCached && <span className="cache-badge">Cached (0 credits)</span>}
        </div>

        <div className="global-settings-display">
          <span className="setting-display">Pitch: <strong>{pitch}</strong></span>
          <span className="setting-display">Speed: <strong>{rate}</strong></span>
          <span className="setting-display">Volume: <strong>{volume}</strong></span>
        </div>

        <ParagraphEmotionSelect
          paragraph={paragraph}
          defaultEmotion={defaultEmotion}
          supported={emotionSupported}
          onChange={(emotion) => onSetEmotion(index, emotion)}
        />

        <div className="paragraph-actions">
          <button
            onClick={() => onGenerate(index, true)}
            disabled={isGenerating || !paragraph.text.trim()}
            className="para-btn generate-btn"
            title="Generate/Regenerate audio" aria-label="Generate/Regenerate audio"
          >
            {isGenerating ? <Loader2 size={18} className="spinning loader-icon" /> : <Mic size={18} />}
          </button>
          <button
            onClick={handlePlayPause}
            disabled={isGenerating || !paragraph.text.trim()}
            className="para-btn play-btn"
            title={isGenerated ? (isPlaying ? "Pause" : "Play/Resume") : "Generate and Play"} aria-label={isGenerated ? (isPlaying ? "Pause" : "Play/Resume") : "Generate and Play"}
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button
            onClick={() => onDelete(index)}
            disabled={isGenerating}
            className="para-btn delete-btn"
            title="Delete paragraph" aria-label="Delete paragraph"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      <div className="paragraph-text">
        <EmotionTextarea
          textareaRef={textareaRef}
          value={paragraph.text}
          segments={paragraph.segments}
          ariaLabel={`Paragraph ${index + 1} text`}
          placeholder={isFirstParagraph ? 'Paste your text here. Multiple paragraphs will be automatically split...' : 'Enter paragraph text...'}
          onChange={handleTextChange}
          onSelectionChange={setRange}
        />

        <EmotionToolbar
          paragraph={paragraph}
          supported={emotionSupported}
          range={range}
          onApply={applyEmotion}
          onClearRange={() => {
            if (range) onClearEmotionRange(index, range.start, range.end);
            setRange(null);
          }}
          onPreview={onPreview ? () => void handlePreview() : undefined}
          isPreviewing={isPreviewing}
        />

        <HighlightList paragraph={paragraph} onRemove={removeSegment} onClearAll={() => onClearHighlights(index)} />

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

export default ParagraphControl;
