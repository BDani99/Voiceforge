import { Eraser, Loader2, Sparkles, Volume2, X } from 'lucide-react';
import CustomSelect from '../../../../components/CustomSelect/CustomSelect';
import { EMOTION_OPTIONS } from '../../../../constants/voiceConstants';
import { emotionHue, emotionIcon, emotionLabel } from '../../../../utils/emotionColors';
import { EMOTION_NEUTRAL, emotionMode } from '../../../../utils/paragraphEmotion';
import type { EmotionSegment } from '../../../../utils/emotionSegments';
import type { Paragraph } from '../../../../types/models';
import type { TextRange } from './EmotionTextarea';
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

interface EmotionToolbarProps {
  paragraph: Paragraph;
  supported: boolean;
  /** Current selection in the text, if any. */
  range: TextRange | null;
  onApply: (emotion: string) => void;
  onClearRange: () => void;
  onPreview?: (() => void) | undefined;
  isPreviewing: boolean;
}

/** Appears while text is selected: give the selection an emotion, clear it, or hear it. */
export function EmotionToolbar({ paragraph, supported, range, onApply, onClearRange, onPreview, isPreviewing }: EmotionToolbarProps) {
  if (!range) return null;

  const selected = paragraph.text.slice(range.start, range.end);
  const blocked = emotionMode(paragraph) === 'paragraph';
  const previewable = onPreview && selected.trim().length > 0 && selected.trim().length < 150;
  const hasHighlightInside = paragraph.segments.some((s) => s.end > range.start && s.start < range.end);

  return (
    <div className="ec-toolbar" role="group" aria-label={`Emotion for the selected text “${snippet(selected)}”`}>
      <div className="ec-toolbar__head">
        <span className="ec-toolbar__selected"><Sparkles size={14} aria-hidden="true" /> “{snippet(selected)}”</span>
        {previewable && (
          <button
            type="button"
            className="ec-btn"
            disabled={isPreviewing}
            onMouseDown={(e) => e.preventDefault()}
            onClick={onPreview}
          >
            {isPreviewing ? <Loader2 size={13} className="spinning" /> : <Volume2 size={13} />} Preview
          </button>
        )}
      </div>

      {!supported ? (
        <p className="ec-toolbar__hint">The selected model does not support emotions. Choose Simba 3.2 or 3.0 in the model list.</p>
      ) : blocked ? (
        <p className="ec-toolbar__hint">
          This paragraph has an emotion for the whole text. Set it to “Default” or “Neutral” to highlight single parts instead.
        </p>
      ) : (
        <div className="ec-chips">
          {EMOTION_OPTIONS.map((e) => (
            <button
              key={e.value}
              type="button"
              className="ec-chip"
              style={{ '--emo-hue': emotionHue(e.value) } as React.CSSProperties}
              onMouseDown={(event) => event.preventDefault()} // keep the text selected
              onClick={() => onApply(e.value)}
            >
              <span aria-hidden="true">{e.icon}</span> {e.label}
            </button>
          ))}
          {hasHighlightInside && (
            <button type="button" className="ec-chip ec-chip--clear" onMouseDown={(event) => event.preventDefault()} onClick={onClearRange}>
              <Eraser size={12} aria-hidden="true" /> No emotion
            </button>
          )}
        </div>
      )}
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
