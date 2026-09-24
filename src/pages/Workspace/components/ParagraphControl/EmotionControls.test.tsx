import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HighlightList, ParagraphEmotionSelect } from './EmotionControls';
import EmotionTextarea from './EmotionTextarea';
import type { Paragraph } from '../../../../types/models';

const paragraph = (patch: Partial<Paragraph> = {}): Paragraph => ({
  id: 'p1', text: 'Hello brave new world', audioBlob: null, audioUrl: null, isGenerated: false, wasCached: false, emotion: '', segments: [], marks: [], speechMarks: null, ...patch,
});

describe('ParagraphEmotionSelect', () => {
  it('shows the default emotion and lets the user choose one for the whole paragraph', async () => {
    const onChange = vi.fn();
    render(<ParagraphEmotionSelect paragraph={paragraph()} defaultEmotion="calm" supported onChange={onChange} />);
    const select = screen.getByRole('combobox', { name: 'Emotion of this paragraph' });
    expect(select).toHaveTextContent('Default · Calm');

    await userEvent.click(select);
    await userEvent.click(screen.getByRole('option', { name: /Sad/ }));
    expect(onChange).toHaveBeenCalledWith('sad');
  });

  it('is locked while highlighted parts exist, because the two exclude each other', () => {
    const segments = [{ start: 6, end: 11, emotion: 'angry' }];
    render(<ParagraphEmotionSelect paragraph={paragraph({ segments })} defaultEmotion="" supported onChange={vi.fn()} />);
    const select = screen.getByRole('combobox', { name: 'Emotion of this paragraph' });
    expect(select).toBeDisabled();
    expect(select).toHaveTextContent('Highlighted parts (1)');
  });

  it('is disabled for models without emotion support', () => {
    render(<ParagraphEmotionSelect paragraph={paragraph()} defaultEmotion="" supported={false} onChange={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Emotion of this paragraph' })).toBeDisabled();
  });
});

describe('HighlightList', () => {
  const segments = [{ start: 6, end: 11, emotion: 'angry' }, { start: 16, end: 21, emotion: 'cheerful' }];

  it('lists highlights and removes a single one', async () => {
    const onRemove = vi.fn();
    render(<HighlightList paragraph={paragraph({ segments })} onRemove={onRemove} onClearAll={vi.fn()} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: /Remove Angry/ }));
    expect(onRemove).toHaveBeenCalledWith(segments[0]);
  });

  it('clears all highlights when there are several', async () => {
    const onClearAll = vi.fn();
    render(<HighlightList paragraph={paragraph({ segments })} onRemove={vi.fn()} onClearAll={onClearAll} />);
    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(onClearAll).toHaveBeenCalled();
  });

  it('renders nothing without highlights', () => {
    const { container } = render(<HighlightList paragraph={paragraph()} onRemove={vi.fn()} onClearAll={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('EmotionTextarea', () => {
  it('reports typing and the selected range', async () => {
    const onChange = vi.fn();
    const onSelectionChange = vi.fn();
    render(<EmotionTextarea value="Hello world" segments={[]} onChange={onChange} onSelectionChange={onSelectionChange} ariaLabel="Text" />);
    const field = screen.getByRole('textbox', { name: 'Text' });

    await userEvent.type(field, '!');
    expect(onChange).toHaveBeenCalledWith('Hello world!');

    await userEvent.tripleClick(field);
    expect(onSelectionChange).toHaveBeenLastCalledWith({ start: 0, end: 11 });
  });

  it('shows the highlighted parts as marks', () => {
    const { container } = render(
      <EmotionTextarea value="Hello world" segments={[{ start: 6, end: 11, emotion: 'angry' }]} onChange={vi.fn()} onSelectionChange={vi.fn()} ariaLabel="Text" />,
    );
    const marks = container.querySelectorAll('.et__mark');
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveTextContent('world');
  });
});

describe('EmotionTextarea marks and cursor', () => {
  it('shows emphasis, pronunciation and pause without changing the text', () => {
    const { container } = render(
      <EmotionTextarea
        value="say 3/4 loudly now"
        segments={[]}
        marks={[
          { kind: 'sub', start: 4, end: 7, value: 'three quarters' },
          { kind: 'emphasis', start: 8, end: 14, value: 'strong' },
          { kind: 'break', start: 14, end: 14, value: '500ms' },
        ]}
        onChange={vi.fn()}
        onSelectionChange={vi.fn()}
        ariaLabel="Text"
      />,
    );
    expect(container.querySelector('.et__sub')).toHaveTextContent('3/4');
    expect(container.querySelector('.et__emph--strong')).toHaveTextContent('loudly');
    expect(screen.getAllByTestId('et-pause')).toHaveLength(1);
    const zeroWidth = new RegExp(String.fromCharCode(0x200b), 'g');
    expect(container.querySelector('.et__backdrop')?.textContent?.replace(zeroWidth, '')).toBe('say 3/4 loudly now');
  });

  it('reports the cursor position when nothing is selected and the target of a blur', async () => {
    const onCaretChange = vi.fn();
    const onBlur = vi.fn();
    render(
      <>
        <EmotionTextarea value="Hello world" segments={[]} onChange={vi.fn()} onSelectionChange={vi.fn()} onCaretChange={onCaretChange} onBlur={onBlur} ariaLabel="Text" />
        <button>elsewhere</button>
      </>,
    );
    const field = screen.getByRole('textbox', { name: 'Text' });
    await userEvent.click(field);
    await userEvent.keyboard('{Home}');
    expect(onCaretChange).toHaveBeenLastCalledWith(0);

    await userEvent.click(screen.getByRole('button', { name: 'elsewhere' }));
    expect(onBlur).toHaveBeenCalledWith(screen.getByRole('button', { name: 'elsewhere' }));
  });
});
