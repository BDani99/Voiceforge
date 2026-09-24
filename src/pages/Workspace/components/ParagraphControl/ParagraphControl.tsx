import { useRef, useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Play, Pause, Loader2, Mic, Check, Trash2 } from 'lucide-react';
import type { GlobalDefaults, Paragraph } from '../../../../types/models';
import type { EmotionSegment } from '../../../../utils/emotionSegments';
import { useBlobDuration } from '../../../../hooks/useBlobDuration';
import { findWordIndex, wordRange } from '../../../../utils/speechMarks';
import EmotionTextarea, { type TextRange } from './EmotionTextarea';
import { HighlightList, MarkList, ParagraphEmotionSelect } from './EmotionControls';
import { SelectionToolbar } from './SelectionToolbar';
import type { TextMark } from '../../../../utils/textMarks';
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
  onApplyMark: (index: number, mark: TextMark) => void;
  onClearMarks: (index: number, start: number, end: number) => void;
  onClearAllMarks: (index: number) => void;
  isFirstParagraph?: boolean;
  /** This paragraph is the one that plays or is paused. */
  isActive?: boolean;
  /** The audio element of a paragraph while it is playing or paused. */
  getAudio?: (index: number) => HTMLAudioElement | null;
  /** Jumps to a position (0..1) in the audio of a paragraph. */
  onSeek?: (index: number, fraction: number) => void;
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
  onApplyMark,
  onClearMarks,
  onClearAllMarks,
  isFirstParagraph = false,
  isActive = false,
  getAudio,
  onSeek,
}: ParagraphControlProps) {
  const [currentTime, setCurrentTime] = useState(0);
  const [liveDuration, setLiveDuration] = useState(0);
  const [activeWord, setActiveWord] = useState(-1);
  const [range, setRange] = useState<TextRange | null>(null);
  const [caret, setCaret] = useState<number | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Length of the audio, known before it is played.
  const knownDuration = useBlobDuration(paragraph.audioBlob);
  const duration = liveDuration || knownDuration;
  const words = paragraph.speechMarks?.words;

  // The position comes from this paragraph's own audio element (never another paragraph's): it is
  // followed frame by frame while playing and read once when paused or stopped.
  useEffect(() => {
    const read = () => {
      const audio = getAudio?.(index) ?? null;
      setCurrentTime(audio ? audio.currentTime : 0);
      setLiveDuration(audio && Number.isFinite(audio.duration) ? audio.duration : 0);
      // The word that is spoken now (only a change re-renders); nothing is highlighted without audio or timings.
      setActiveWord(audio && words ? findWordIndex(words, audio.currentTime * 1000) : -1);
    };

    read();
    if (!isPlaying) return undefined;

    let frame = 0;
    const tick = () => {
      read();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, isActive, getAudio, index, words]);

  const activeRange = useMemo(() => {
    const word = words?.[activeWord];
    return word ? wordRange(paragraph.text, word) : null;
  }, [words, activeWord, paragraph.text]);

  const seekTo = (fraction: number) => {
    const position = Math.max(0, Math.min(1, fraction));
    onSeek?.(index, position);
    if (duration > 0) setCurrentTime(position * duration);
  };

  const handleSeek = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width > 0) seekTo((e.clientX - rect.left) / rect.width);
  };

  const handleSeekKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    const step = e.key === 'ArrowRight' ? 5 : e.key === 'ArrowLeft' ? -5 : 0;
    if (step === 0) return;
    e.preventDefault();
    seekTo((currentTime + step) / duration);
  };

  /** Elapsed time rounds down, the total rounds up, so a clip never looks shorter than it is. */
  const formatTime = (secs: number, round: (value: number) => number = Math.floor) => {
    if (isNaN(secs) || !isFinite(secs)) return '0:00';
    const whole = round(secs);
    return `${Math.floor(whole / 60)}:${(whole % 60).toString().padStart(2, '0')}`;
  };

  const handleTextChange = (newText: string) => {
    if (isFirstParagraph && newText.includes('\n')) {
      onSplitText(newText);
    } else {
      onUpdate(index, newText);
    }
    setRange(null); // positions changed
    setCaret(null);
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
          {paragraph.wasCached && <span className="cache-badge" title="Loaded from the shared cache: no credits were charged">Cached</span>}
        </div>

        <div className="global-settings-display" title={`Pitch ${pitch}, speed ${rate}, volume ${volume}`}>
          Pitch <strong>{pitch}</strong> · Speed <strong>{rate}</strong> · Vol <strong>{volume}</strong>
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
            onClick={() => void onPlay(index)}
            disabled={isGenerating || !paragraph.text.trim()}
            className="para-btn play-btn"
            title={isGenerated ? (isPlaying ? "Pause" : "Play/Resume") : "Generate and Play"} aria-label={isGenerated ? (isPlaying ? "Pause" : "Play/Resume") : "Generate and Play"}
          >
            {isGenerating ? <Loader2 size={18} className="spinning loader-icon" /> : isPlaying ? <Pause size={18} /> : <Play size={18} />}
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
          marks={paragraph.marks}
          activeRange={activeRange}
          ariaLabel={`Paragraph ${index + 1} text`}
          placeholder={isFirstParagraph ? 'Paste your text here. Multiple paragraphs will be automatically split...' : 'Enter paragraph text...'}
          onChange={handleTextChange}
          onSelectionChange={setRange}
          onCaretChange={setCaret}
          onBlur={(next) => {
            // The cursor toolbar goes away with the focus, unless the focus moves into the toolbar itself.
            if (!(next instanceof Element && next.closest('.ec-toolbar'))) setCaret(null);
          }}
        />

        <SelectionToolbar
          paragraph={paragraph}
          supported={emotionSupported}
          range={range}
          caret={caret}
          onApplyEmotion={applyEmotion}
          onClearEmotion={() => {
            if (range) onClearEmotionRange(index, range.start, range.end);
            setRange(null);
          }}
          onApplyMark={(mark) => onApplyMark(index, mark)}
          onClearMarks={(start, end) => onClearMarks(index, start, end)}
          onPreview={onPreview ? () => void handlePreview() : undefined}
          isPreviewing={isPreviewing}
        />

        <HighlightList paragraph={paragraph} onRemove={removeSegment} onClearAll={() => onClearHighlights(index)} />

        <MarkList
          paragraph={paragraph}
          onRemove={(mark) => onClearMarks(index, mark.start, mark.end)}
          onClearAll={() => onClearAllMarks(index)}
        />

        {/* Local Progress Bar */}
        {(isGenerated || isGenerating) && (
          <div className="local-timeline-container">
            <div className="local-time">{formatTime(currentTime)}</div>
            <div
              className="local-progress-bar-wrapper"
              role="slider"
              tabIndex={duration > 0 ? 0 : -1}
              aria-label={`Position in paragraph ${index + 1}`}
              aria-valuemin={0}
              aria-valuemax={Math.round(duration)}
              aria-valuenow={Math.round(currentTime)}
              aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration, Math.ceil)}`}
              onClick={handleSeek}
              onKeyDown={handleSeekKey}
            >
              <div className="local-progress-bg">
                <div
                  className="local-progress-fill"
                  style={{ width: `${duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0}%` }}
                />
              </div>
            </div>
            <div className="local-time">{formatTime(duration, Math.ceil)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ParagraphControl;
