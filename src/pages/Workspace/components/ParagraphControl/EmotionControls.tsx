import { X } from 'lucide-react';
import CustomSelect from '../../../../components/CustomSelect/CustomSelect';
import { EMOTION_OPTIONS } from '../../../../constants/voiceConstants';
import { emotionHue, emotionIcon, emotionLabel } from '../../../../utils/emotionColors';
import { pauseLabel } from '../../../../utils/displayRuns';
import { MAX_TOTAL_BREAK_MS, markLabel, totalBreakMs, type TextMark } from '../../../../utils/textMarks';
import { EMOTION_NEUTRAL, emotionMode } from '../../../../utils/paragraphEmotion';
import type { EmotionSegment } from '../../../../utils/emotionSegments';
import type { Paragraph } from '../../../../types/models';
import './EmotionControls.css';

const HIGHLIGHTS_VALUE = '__highlights__';
const MAX_SNIPPET = 28;

const snippet = (text: string): string => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > MAX_SNIPPET ? `${flat.slice(0, MAX_SNIPPET - 1)}…` : flat;
};

interface ParagraphEmotionSelectProps {
  paragraph: Paragraph;
  /** Emotion that applies to paragraphs without their own setting. */
  defaultEmotion: string;
  supported: boolean;
  onChange: (emotion: string) => void;
}

/** Emotion of the whole paragraph. Disabled while highlighted parts exist: the two exclude each other. */
export function ParagraphEmotionSelect({ paragraph, defaultEmotion, supported, onChange }: ParagraphEmotionSelectProps) {
  const mode = emotionMode(paragraph);
  const highlights = mode === 'highlights';

  const options = !supported
    ? [{ value: '', label: 'No emotions (model)' }]
    : [
        { value: '', label: `Default · ${defaultEmotion ? emotionLabel(defaultEmotion) : 'neutral'}` },
        { value: EMOTION_NEUTRAL, label: 'Neutral (no emotion)' },
        ...EMOTION_OPTIONS.map((e) => ({ value: e.value, label: `${e.icon} ${e.label}` })),
        ...(highlights ? [{ value: HIGHLIGHTS_VALUE, label: `Highlighted parts (${paragraph.segments.length})` }] : []),
      ];

  return (
    <div className="ec-select" title={!supported ? 'The selected model does not support emotions. Choose Simba 3.2 or 3.0.' : highlights ? 'Clear the highlighted parts to set an emotion for the whole paragraph' : undefined}>
      <CustomSelect
        ariaLabel="Emotion of this paragraph"
        value={!supported ? '' : highlights ? HIGHLIGHTS_VALUE : paragraph.emotion}
        onChange={(value) => onChange(value)}
        options={options}
        disabled={!supported || highlights}
      />
    </div>
  );
}

interface HighlightListProps {
  paragraph: Paragraph;
  onRemove: (segment: EmotionSegment) => void;
  onClearAll: () => void;
}

/** The highlighted parts of a paragraph as removable chips. */
export function HighlightList({ paragraph, onRemove, onClearAll }: HighlightListProps) {
  if (paragraph.segments.length === 0) return null;

  return (
    <div className="ec-highlights">
      <span className="ec-highlights__title">Highlighted emotions</span>
      <ul className="ec-highlights__list">
        {paragraph.segments.map((segment) => (
          <li key={`${segment.start}-${segment.end}`} className="ec-tag" style={{ '--emo-hue': emotionHue(segment.emotion) } as React.CSSProperties}>
            <span>{emotionIcon(segment.emotion)} {emotionLabel(segment.emotion)}</span>
            <span className="ec-tag__text">“{snippet(paragraph.text.slice(segment.start, segment.end))}”</span>
            <button type="button" aria-label={`Remove ${emotionLabel(segment.emotion)} from “${snippet(paragraph.text.slice(segment.start, segment.end))}”`} onClick={() => onRemove(segment)}>
              <X size={12} />
            </button>
          </li>
        ))}
      </ul>
      {paragraph.segments.length > 1 && (
        <button type="button" className="ec-link" onClick={onClearAll}>Clear all</button>
      )}
    </div>
  );
}

interface MarkListProps {
  paragraph: Paragraph;
  onRemove: (mark: TextMark) => void;
  onClearAll: () => void;
}

const markText = (paragraph: Paragraph, mark: TextMark): string => {
  if (mark.kind === 'break') {
    const before = paragraph.text.slice(Math.max(0, mark.start - 14), mark.start).trim();
    return before ? `after “…${before.split(/\s+/).slice(-2).join(' ')}”` : 'at the start';
  }
  return `“${snippet(paragraph.text.slice(mark.start, mark.end))}”`;
};

const markDescription = (paragraph: Paragraph, mark: TextMark): string =>
  mark.kind === 'sub'
    ? `${markText(paragraph, mark)} → “${snippet(mark.value)}”`
    : markText(paragraph, mark);

/** Emphasis, pronunciations and pauses of a paragraph as removable chips. */
export function MarkList({ paragraph, onRemove, onClearAll }: MarkListProps) {
  if (paragraph.marks.length === 0) return null;
  const tooLong = totalBreakMs(paragraph.marks) > MAX_TOTAL_BREAK_MS;

  return (
    <div className="ec-highlights">
      <span className="ec-highlights__title">Emphasis, pronunciation and pauses</span>
      <ul className="ec-highlights__list">
        {paragraph.marks.map((mark) => (
          <li key={`${mark.kind}-${mark.start}-${mark.end}`} className={`ec-tag ec-tag--${mark.kind}`}>
            <span>{mark.kind === 'break' ? `Pause ${pauseLabel(mark.value)}` : markLabel(mark).replace('Pronounced as', 'Say')}</span>
            <span className="ec-tag__text">{markDescription(paragraph, mark)}</span>
            <button type="button" aria-label={`Remove ${markLabel(mark).toLowerCase()} ${markText(paragraph, mark)}`} onClick={() => onRemove(mark)}>
              <X size={12} />
            </button>
          </li>
        ))}
      </ul>
      {paragraph.marks.length > 1 && (
        <button type="button" className="ec-link" onClick={onClearAll}>Clear all</button>
      )}
      {tooLong && <p className="ec-toolbar__hint" role="status">Speechify ignores pauses beyond 30 seconds in total.</p>}
    </div>
  );
}
