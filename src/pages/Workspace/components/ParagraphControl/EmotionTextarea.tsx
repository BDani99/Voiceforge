import { useLayoutEffect, useMemo, type Ref } from 'react';
import { toRuns, type EmotionSegment } from '../../../../utils/emotionSegments';
import { emotionHue } from '../../../../utils/emotionColors';
import './EmotionControls.css';

export interface TextRange {
  start: number;
  end: number;
}

interface EmotionTextareaProps {
  value: string;
  segments: EmotionSegment[];
  onChange: (value: string) => void;
  /** Called with the selected range, or null when nothing is selected. */
  onSelectionChange: (range: TextRange | null) => void;
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
  onChange,
  onSelectionChange,
  placeholder,
  ariaLabel,
  disabled,
  textareaRef,
}: EmotionTextareaProps) {
  const runs = useMemo(() => toRuns(value, segments), [value, segments]);

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
    onSelectionChange(end > start ? { start, end } : null);
  };

  return (
    <div className="et">
      <div className="et__backdrop" aria-hidden="true">
        {runs.map((run, i) => (
          run.emotion
            ? <mark key={i} className="et__mark" style={{ '--emo-hue': emotionHue(run.emotion) } as React.CSSProperties}>{run.text}</mark>
            : <span key={i}>{run.text}</span>
        ))}
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
      />
    </div>
  );
}
