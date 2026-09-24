import { useLayoutEffect, useMemo, type Ref } from 'react';
import type { EmotionSegment } from '../../../../utils/emotionSegments';
import type { TextMark } from '../../../../utils/textMarks';
import { toDisplayRuns } from '../../../../utils/displayRuns';
import { emotionHue } from '../../../../utils/emotionColors';
import './EmotionControls.css';

export interface TextRange {
  start: number;
  end: number;
}

interface EmotionTextareaProps {
  value: string;
  segments: EmotionSegment[];
  /** Emphasis, pronunciations and pauses shown in the text. */
  marks?: TextMark[];
  onChange: (value: string) => void;
  /** Called with the selected range, or null when nothing is selected. */
  onSelectionChange: (range: TextRange | null) => void;
  /** Called with the cursor position while nothing is selected. */
  onCaretChange?: (position: number) => void;
  /** Called when the field loses focus; `next` is the element that gets the focus. */
  onBlur?: (next: EventTarget | null) => void;
  placeholder?: string;
  ariaLabel: string;
  disabled?: boolean;
  textareaRef?: Ref<HTMLTextAreaElement>;
}

/**
 * A textarea whose highlighted parts (emotions) are shown as coloured marks behind the text. The
 * marks live in a mirrored layer, so the field keeps all native editing behaviour. It grows with
 * its content, which keeps both layers aligned without scroll synchronisation.
 */
export default function EmotionTextarea({
  value,
  segments,
  marks = [],
  onChange,
  onSelectionChange,
  onCaretChange,
  onBlur,
  placeholder,
  ariaLabel,
  disabled,
  textareaRef,
}: EmotionTextareaProps) {
  const { runs, endPause } = useMemo(() => toDisplayRuns(value, segments, marks), [value, segments, marks]);

  // Grow the field to its content whenever the text changes.
  useLayoutEffect(() => {
    if (typeof textareaRef === 'object' && textareaRef?.current) {
      const field = textareaRef.current;
      field.style.height = 'auto';
      field.style.height = `${field.scrollHeight}px`;
    }
  }, [value, textareaRef]);

  const reportSelection = (field: HTMLTextAreaElement) => {
    const { selectionStart: start, selectionEnd: end } = field;
    if (end > start) {
      onSelectionChange({ start, end });
    } else {
      onSelectionChange(null);
      onCaretChange?.(start);
    }
  };

  return (
    <div className="et">
      <div className="et__backdrop" aria-hidden="true">
        {runs.map((run, i) => {
          const classes = [
            run.emotion ? 'et__mark' : '',
            run.emphasis ? `et__emph et__emph--${run.emphasis}` : '',
            run.alias ? 'et__sub' : '',
          ].filter(Boolean).join(' ');
          return (
            <span key={i}>
              {run.pause && <span className="et__pause" data-testid="et-pause" />}
              <span
                className={classes || undefined}
                style={run.emotion ? { '--emo-hue': emotionHue(run.emotion) } as React.CSSProperties : undefined}
              >
                {run.text}
              </span>
            </span>
          );
        })}
        {endPause && <span className="et__pause" data-testid="et-pause" />}
        {'​'}
      </div>
      <textarea
        ref={textareaRef}
        className="et__input"
        value={value}
        disabled={disabled}
        rows={4}
        placeholder={placeholder}
        aria-label={ariaLabel}
        spellCheck
        onChange={(e) => onChange(e.target.value)}
        onSelect={(e) => reportSelection(e.currentTarget)}
        onBlur={(e) => onBlur?.(e.relatedTarget)}
      />
    </div>
  );
}
