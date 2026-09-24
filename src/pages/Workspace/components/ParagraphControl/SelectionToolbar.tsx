import { useState, type FormEvent } from 'react';
import { Eraser, Loader2, Sparkles, Volume2 } from 'lucide-react';
import { EMOTION_OPTIONS } from '../../../../constants/voiceConstants';
import { emotionHue } from '../../../../utils/emotionColors';
import { pauseLabel } from '../../../../utils/displayRuns';
import { emotionMode } from '../../../../utils/paragraphEmotion';
import {
  EMPHASIS_LEVELS,
  MAX_ALIAS_LENGTH,
  MAX_BREAK_MS,
  type TextMark,
} from '../../../../utils/textMarks';
import type { Paragraph } from '../../../../types/models';
import type { TextRange } from './EmotionTextarea';
import './EmotionControls.css';

const MAX_SNIPPET = 28;
const PAUSES = ['250ms', '500ms', '1000ms', '2000ms'];

type Tab = 'emotion' | 'emphasis' | 'pronounce' | 'pause';

const TABS: { id: Tab; label: string }[] = [
  { id: 'emotion', label: 'Emotion' },
  { id: 'emphasis', label: 'Emphasis' },
  { id: 'pronounce', label: 'Pronounce' },
  { id: 'pause', label: 'Pause' },
];

const snippet = (text: string): string => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > MAX_SNIPPET ? `${flat.slice(0, MAX_SNIPPET - 1)}…` : flat;
};

/** Buttons that act on the text selection must not take the selection away from the field. */
const keepSelection = (event: { preventDefault: () => void }) => event.preventDefault();

interface SelectionToolbarProps {
  paragraph: Paragraph;
  /** Whether the model supports emotions and emphasis. */
  supported: boolean;
  /** Current selection in the text, if any. */
  range: TextRange | null;
  /** Cursor position while nothing is selected. */
  caret: number | null;
  onApplyEmotion: (emotion: string) => void;
  onClearEmotion: () => void;
  onApplyMark: (mark: TextMark) => void;
  onClearMarks: (start: number, end: number) => void;
  onPreview?: (() => void) | undefined;
  isPreviewing: boolean;
}

/**
 * Appears while text is selected (or the cursor is in the text): give the selection an emotion, an
 * emphasis or another pronunciation, put a pause behind it, or hear it.
 */
export function SelectionToolbar({
  paragraph,
  supported,
  range,
  caret,
  onApplyEmotion,
  onClearEmotion,
  onApplyMark,
  onClearMarks,
  onPreview,
  isPreviewing,
}: SelectionToolbarProps) {
  const [tab, setTab] = useState<Tab>('emotion');

  // With only a cursor, a pause is the one thing that makes sense.
  if (!range && caret === null) return null;
  const activeTab: Tab = range ? tab : 'pause';

  const selected = range ? paragraph.text.slice(range.start, range.end) : '';
  const previewable = range && onPreview && selected.trim().length > 0 && selected.trim().length < 150;

  return (
    <div
      className="ec-toolbar"
      role="group"
      aria-label={range ? `Emotion for the selected text “${snippet(selected)}”` : 'Pause at the cursor'}
    >
      <div className="ec-toolbar__head">
        <span className="ec-toolbar__selected">
          <Sparkles size={14} aria-hidden="true" /> {range ? `“${snippet(selected)}”` : 'Cursor position'}
        </span>
        {previewable && (
          <button type="button" className="ec-btn" disabled={isPreviewing} onMouseDown={keepSelection} onClick={onPreview}>
            {isPreviewing ? <Loader2 size={13} className="spinning" /> : <Volume2 size={13} />} Preview
          </button>
        )}
      </div>

      {range && (
        <div className="ec-tabs" role="tablist" aria-label="What to change">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeTab === t.id}
              className={`ec-tab${activeTab === t.id ? ' is-active' : ''}`}
              onMouseDown={keepSelection}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {activeTab === 'emotion' && range && (
        <EmotionPanel paragraph={paragraph} supported={supported} range={range} onApply={onApplyEmotion} onClear={onClearEmotion} />
      )}
      {activeTab === 'emphasis' && range && (
        <EmphasisPanel paragraph={paragraph} supported={supported} range={range} onApply={onApplyMark} onClear={onClearMarks} />
      )}
      {activeTab === 'pronounce' && range && (
        <PronouncePanel key={`${range.start}-${range.end}`} paragraph={paragraph} range={range} onApply={onApplyMark} onClear={onClearMarks} />
      )}
      {activeTab === 'pause' && (
        <PausePanel
          paragraph={paragraph}
          position={range ? range.end : caret ?? 0}
          after={range !== null}
          onApply={onApplyMark}
          onClear={onClearMarks}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------------- panels

function EmotionPanel({ paragraph, supported, range, onApply, onClear }: {
  paragraph: Paragraph;
  supported: boolean;
  range: TextRange;
  onApply: (emotion: string) => void;
  onClear: () => void;
}) {
  const blocked = emotionMode(paragraph) === 'paragraph';
  const hasHighlightInside = paragraph.segments.some((s) => s.end > range.start && s.start < range.end);

  if (!supported) {
    return <p className="ec-toolbar__hint">The selected model does not support emotions. Choose Simba 3.2 or 3.0 in the model list.</p>;
  }
  if (blocked) {
    return (
      <p className="ec-toolbar__hint">
        This paragraph has an emotion for the whole text. Set it to “Default” or “Neutral” to highlight single parts instead.
      </p>
    );
  }
  return (
    <div className="ec-chips">
      {EMOTION_OPTIONS.map((e) => (
        <button
          key={e.value}
          type="button"
          className="ec-chip"
          style={{ '--emo-hue': emotionHue(e.value) } as React.CSSProperties}
          onMouseDown={keepSelection}
          onClick={() => onApply(e.value)}
        >
          <span aria-hidden="true">{e.icon}</span> {e.label}
        </button>
      ))}
      {hasHighlightInside && (
        <button type="button" className="ec-chip ec-chip--clear" onMouseDown={keepSelection} onClick={onClear}>
          <Eraser size={12} aria-hidden="true" /> No emotion
        </button>
      )}
    </div>
  );
}

const overlapsKind = (paragraph: Paragraph, kind: TextMark['kind'], start: number, end: number): boolean =>
  paragraph.marks.some((m) => m.kind === kind && m.end > start && m.start < end);

function EmphasisPanel({ paragraph, supported, range, onApply, onClear }: {
  paragraph: Paragraph;
  supported: boolean;
  range: TextRange;
  onApply: (mark: TextMark) => void;
  onClear: (start: number, end: number) => void;
}) {
  if (!supported) {
    return <p className="ec-toolbar__hint">The selected model does not support emphasis. Choose Simba 3.2 or 3.0 in the model list.</p>;
  }
  return (
    <div className="ec-chips">
      {EMPHASIS_LEVELS.map((level) => (
        <button
          key={level}
          type="button"
          className="ec-chip ec-chip--emphasis"
          onMouseDown={keepSelection}
          onClick={() => onApply({ kind: 'emphasis', start: range.start, end: range.end, value: level })}
        >
          {level.charAt(0).toUpperCase() + level.slice(1)}
        </button>
      ))}
      {overlapsKind(paragraph, 'emphasis', range.start, range.end) && (
        <button type="button" className="ec-chip ec-chip--clear" onMouseDown={keepSelection} onClick={() => onClear(range.start, range.end)}>
          <Eraser size={12} aria-hidden="true" /> No emphasis
        </button>
      )}
    </div>
  );
}

function PronouncePanel({ paragraph, range, onApply, onClear }: {
  paragraph: Paragraph;
  range: TextRange;
  onApply: (mark: TextMark) => void;
  onClear: (start: number, end: number) => void;
}) {
  const existing = paragraph.marks.find((m) => m.kind === 'sub' && m.start === range.start && m.end === range.end);
  const [alias, setAlias] = useState(existing?.value ?? '');

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = alias.trim();
    if (value) onApply({ kind: 'sub', start: range.start, end: range.end, value });
  };

  return (
    <form className="ec-form" onSubmit={submit}>
      <label className="ec-form__label" htmlFor="ec-alias">Read this as</label>
      <div className="ec-form__row">
        <input
          id="ec-alias"
          className="ec-input"
          value={alias}
          maxLength={MAX_ALIAS_LENGTH}
          placeholder="e.g. three quarters"
          onChange={(e) => setAlias(e.target.value)}
        />
        <button type="submit" className="ec-btn ec-btn--primary" disabled={!alias.trim()}>Apply</button>
        {overlapsKind(paragraph, 'sub', range.start, range.end) && (
          <button type="button" className="ec-btn" onClick={() => onClear(range.start, range.end)}>
            <Eraser size={12} aria-hidden="true" /> Remove
          </button>
        )}
      </div>
      <p className="ec-toolbar__hint">
        Write the words the voice should say for numbers, dates, units or abbreviations (3/4 → “three quarters”).
      </p>
    </form>
  );
}

function PausePanel({ paragraph, position, after, onApply, onClear }: {
  paragraph: Paragraph;
  position: number;
  after: boolean;
  onApply: (mark: TextMark) => void;
  onClear: (start: number, end: number) => void;
}) {
  const [custom, setCustom] = useState('');
  const existing = paragraph.marks.find((m) => m.kind === 'break' && m.start === position);
  const add = (value: string) => onApply({ kind: 'break', start: position, end: position, value });

  const submitCustom = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ms = Math.round(Number(custom));
    if (ms > 0 && ms <= MAX_BREAK_MS) add(`${ms}ms`);
  };

  return (
    <div className="ec-form">
      <span className="ec-form__label">{after ? 'Pause after the selection' : 'Pause at the cursor'}</span>
      <div className="ec-chips">
        {PAUSES.map((value) => (
          <button
            key={value}
            type="button"
            className={`ec-chip ec-chip--pause${existing?.value === value ? ' is-active' : ''}`}
            onMouseDown={keepSelection}
            onClick={() => add(value)}
          >
            {pauseLabel(value)}
          </button>
        ))}
        {existing && (
          <button type="button" className="ec-chip ec-chip--clear" onMouseDown={keepSelection} onClick={() => onClear(position, position)}>
            <Eraser size={12} aria-hidden="true" /> No pause
          </button>
        )}
      </div>
      <form className="ec-form__row" onSubmit={submitCustom}>
        <input
          className="ec-input ec-input--small"
          type="number"
          min={50}
          max={MAX_BREAK_MS}
          step={50}
          value={custom}
          aria-label="Pause in milliseconds"
          placeholder="ms"
          onChange={(e) => setCustom(e.target.value)}
        />
        <button type="submit" className="ec-btn" disabled={!(Number(custom) > 0 && Number(custom) <= MAX_BREAK_MS)}>Set custom pause</button>
      </form>
    </div>
  );
}
