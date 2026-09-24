import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SelectionToolbar } from './SelectionToolbar';
import { MarkList } from './EmotionControls';
import type { Paragraph } from '../../../../types/models';

const paragraph = (patch: Partial<Paragraph> = {}): Paragraph => ({
  id: 'p1', text: 'It costs 3/4 of a dollar today', audioBlob: null, audioUrl: null, isGenerated: false, wasCached: false, emotion: '', segments: [], marks: [], ...patch,
});

const setup = (patch: Partial<React.ComponentProps<typeof SelectionToolbar>> = {}) => {
  const props = {
    paragraph: paragraph(),
    supported: true,
    range: { start: 9, end: 12 },
    caret: null,
    onApplyEmotion: vi.fn(),
    onClearEmotion: vi.fn(),
    onApplyMark: vi.fn(),
    onClearMarks: vi.fn(),
    isPreviewing: false,
    ...patch,
  };
  render(<SelectionToolbar {...props} />);
  return { props, user: userEvent.setup() };
};

const openTab = (user: ReturnType<typeof userEvent.setup>, name: string) => user.click(screen.getByRole('tab', { name }));

describe('SelectionToolbar', () => {
  it('renders nothing without a selection or cursor', () => {
    const { container } = render(
      <SelectionToolbar paragraph={paragraph()} supported range={null} caret={null} onApplyEmotion={vi.fn()} onClearEmotion={vi.fn()} onApplyMark={vi.fn()} onClearMarks={vi.fn()} isPreviewing={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  describe('emotion tab (the default)', () => {
    it('applies the chosen emotion to the selection', async () => {
      const { props, user } = setup();
      expect(screen.getByRole('group')).toHaveAccessibleName(/3\/4/);
      await user.click(screen.getByRole('button', { name: /Angry/ }));
      expect(props.onApplyEmotion).toHaveBeenCalledWith('angry');
    });

    it('offers to remove an emotion only where one exists', () => {
      setup({ paragraph: paragraph({ segments: [{ start: 9, end: 12, emotion: 'sad' }] }) });
      expect(screen.getByRole('button', { name: /No emotion/ })).toBeInTheDocument();
    });

    it('explains the exclusion instead of offering emotions when the whole paragraph has one', () => {
      setup({ paragraph: paragraph({ emotion: 'sad' }) });
      expect(screen.getByText(/emotion for the whole text/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Angry/ })).not.toBeInTheDocument();
    });

    it('explains when the model has no emotions', () => {
      setup({ supported: false });
      expect(screen.getByText(/does not support emotions/)).toBeInTheDocument();
    });

    it('a neutral paragraph allows highlighting', () => {
      setup({ paragraph: paragraph({ emotion: 'none' }) });
      expect(screen.getByRole('button', { name: /Angry/ })).toBeInTheDocument();
    });
  });

  describe('emphasis tab', () => {
    it('applies an emphasis level to the selection, whatever the paragraph emotion is', async () => {
      const { props, user } = setup({ paragraph: paragraph({ emotion: 'sad' }) });
      await openTab(user, 'Emphasis');
      await user.click(screen.getByRole('button', { name: 'Strong' }));
      expect(props.onApplyMark).toHaveBeenCalledWith({ kind: 'emphasis', start: 9, end: 12, value: 'strong' });
    });

    it('offers removal only when there is emphasis, and warns about unsupported models', async () => {
      const { props, user } = setup({ paragraph: paragraph({ marks: [{ kind: 'emphasis', start: 9, end: 12, value: 'reduced' }] }) });
      await openTab(user, 'Emphasis');
      await user.click(screen.getByRole('button', { name: /No emphasis/ }));
      expect(props.onClearMarks).toHaveBeenCalledWith(9, 12);
    });

    it('explains when the model has no emphasis', async () => {
      const { user } = setup({ supported: false });
      await openTab(user, 'Emphasis');
      expect(screen.getByText(/does not support emphasis/)).toBeInTheDocument();
    });
  });

  describe('pronounce tab', () => {
    it('replaces the selection with the alias', async () => {
      const { props, user } = setup();
      await openTab(user, 'Pronounce');
      const apply = screen.getByRole('button', { name: 'Apply' });
      expect(apply).toBeDisabled();

      await user.type(screen.getByLabelText('Read this as'), 'three quarters');
      await user.click(apply);
      expect(props.onApplyMark).toHaveBeenCalledWith({ kind: 'sub', start: 9, end: 12, value: 'three quarters' });
    });

    it('shows the current alias and can remove it', async () => {
      const { props, user } = setup({ paragraph: paragraph({ marks: [{ kind: 'sub', start: 9, end: 12, value: 'three quarters' }] }) });
      await openTab(user, 'Pronounce');
      expect(screen.getByLabelText('Read this as')).toHaveValue('three quarters');
      await user.click(screen.getByRole('button', { name: /Remove/ }));
      expect(props.onClearMarks).toHaveBeenCalledWith(9, 12);
    });
  });

  describe('pause tab', () => {
    it('puts a pause behind the selection', async () => {
      const { props, user } = setup();
      await openTab(user, 'Pause');
      expect(screen.getByText('Pause after the selection')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: '500 ms' }));
      expect(props.onApplyMark).toHaveBeenCalledWith({ kind: 'break', start: 12, end: 12, value: '500ms' });
    });

    it('takes a custom time within the limit', async () => {
      const { props, user } = setup();
      await openTab(user, 'Pause');
      const set = screen.getByRole('button', { name: 'Set custom pause' });
      await user.type(screen.getByLabelText('Pause in milliseconds'), '20000');
      expect(set).toBeDisabled();
      await user.clear(screen.getByLabelText('Pause in milliseconds'));
      await user.type(screen.getByLabelText('Pause in milliseconds'), '1750');
      await user.click(set);
      expect(props.onApplyMark).toHaveBeenCalledWith({ kind: 'break', start: 12, end: 12, value: '1750ms' });
    });

    it('with only a cursor, offers a pause at the cursor and nothing else', async () => {
      const { props, user } = setup({ range: null, caret: 4, paragraph: paragraph({ marks: [{ kind: 'break', start: 4, end: 4, value: '250ms' }] }) });
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
      expect(screen.getByRole('group')).toHaveAccessibleName('Pause at the cursor');
      await user.click(screen.getByRole('button', { name: '2 s' }));
      expect(props.onApplyMark).toHaveBeenCalledWith({ kind: 'break', start: 4, end: 4, value: '2000ms' });
      await user.click(screen.getByRole('button', { name: /No pause/ }));
      expect(props.onClearMarks).toHaveBeenCalledWith(4, 4);
    });
  });
});

describe('MarkList', () => {
  const marks = [
    { kind: 'emphasis' as const, start: 9, end: 12, value: 'strong' },
    { kind: 'sub' as const, start: 9, end: 12, value: 'three quarters' },
    { kind: 'break' as const, start: 20, end: 20, value: '1500ms' },
  ];

  it('lists every mark and removes one', async () => {
    const onRemove = vi.fn();
    render(<MarkList paragraph={paragraph({ marks })} onRemove={onRemove} onClearAll={vi.fn()} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText(/3\/4” → “three quarters/)).toBeInTheDocument();
    expect(screen.getByText(/1.5 s/)).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole('button', { name: /^Remove/ })[0]!);
    expect(onRemove).toHaveBeenCalledWith(marks[0]);
  });

  it('clears all, and warns when the pauses exceed what Speechify honours', async () => {
    const onClearAll = vi.fn();
    const long = Array.from({ length: 4 }, (_, i) => ({ kind: 'break' as const, start: i + 1, end: i + 1, value: '9000ms' }));
    render(<MarkList paragraph={paragraph({ marks: long })} onRemove={vi.fn()} onClearAll={onClearAll} />);
    expect(screen.getByRole('status')).toHaveTextContent('beyond 30 seconds');
    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(onClearAll).toHaveBeenCalled();
  });

  it('renders nothing without marks', () => {
    const { container } = render(<MarkList paragraph={paragraph()} onRemove={vi.fn()} onClearAll={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
