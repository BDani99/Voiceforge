import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmotionToolbar, HighlightList, ParagraphEmotionSelect } from './EmotionControls';
import EmotionTextarea from './EmotionTextarea';
import type { Paragraph } from '../../../../types/models';

const paragraph = (patch: Partial<Paragraph> = {}): Paragraph => ({
  id: 'p1', text: 'Hello brave new world', audioBlob: null, audioUrl: null, isGenerated: false, wasCached: false, emotion: '', segments: [], ...patch,
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

describe('EmotionToolbar', () => {
  const props = { supported: true, onApply: vi.fn(), onClearRange: vi.fn(), isPreviewing: false };

  it('renders nothing without a selection', () => {
    const { container } = render(<EmotionToolbar {...props} paragraph={paragraph()} range={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('applies the chosen emotion to the selection', async () => {
    const onApply = vi.fn();
    render(<EmotionToolbar {...props} onApply={onApply} paragraph={paragraph()} range={{ start: 6, end: 21 }} />);
    expect(screen.getByRole('group')).toHaveAccessibleName(/brave new world/);

    await userEvent.click(screen.getByRole('button', { name: /Angry/ }));
    expect(onApply).toHaveBeenCalledWith('angry');
  });

  it('offers to remove an emotion only where one exists', () => {
    const { rerender } = render(<EmotionToolbar {...props} paragraph={paragraph()} range={{ start: 0, end: 5 }} />);
    expect(screen.queryByRole('button', { name: /No emotion/ })).not.toBeInTheDocument();

    rerender(<EmotionToolbar {...props} paragraph={paragraph({ segments: [{ start: 0, end: 5, emotion: 'sad' }] })} range={{ start: 0, end: 5 }} />);
    expect(screen.getByRole('button', { name: /No emotion/ })).toBeInTheDocument();
  });

  it('explains the exclusion instead of offering emotions when the whole paragraph has one', () => {
    render(<EmotionToolbar {...props} paragraph={paragraph({ emotion: 'sad' })} range={{ start: 0, end: 5 }} />);
    expect(screen.getByText(/emotion for the whole text/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Angry/ })).not.toBeInTheDocument();
  });

  it('explains when the model has no emotions', () => {
    render(<EmotionToolbar {...props} supported={false} paragraph={paragraph()} range={{ start: 0, end: 5 }} />);
    expect(screen.getByText(/does not support emotions/)).toBeInTheDocument();
  });

  it('a neutral paragraph allows highlighting', () => {
    render(<EmotionToolbar {...props} paragraph={paragraph({ emotion: 'none' })} range={{ start: 0, end: 5 }} />);
    expect(screen.getByRole('button', { name: /Angry/ })).toBeInTheDocument();
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
