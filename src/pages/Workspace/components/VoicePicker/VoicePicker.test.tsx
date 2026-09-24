import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VoiceCard from './VoiceCard';
import VoicePickerModal from './VoicePickerModal';
import SampleButton from './SampleButton';
import type { PreviewPlayer } from '../../../../hooks/usePreviewPlayer';
import type { Voice } from '../../../../types/models';

const models = (...names: string[]) => names.map((name) => ({ name, languages: [{ locale: 'x', preview_audio: `https://cdn/${name}.mp3` }] }));

const alicia: Voice = {
  id: 'alicia', display_name: 'Alicia', gender: 'female', locale: 'en-US', tags: ['use-case:audiobook'],
  preview_audio: 'https://cdn/alicia.mp3', models: models('simba-3.2', 'simba-3.0'),
};
const oliver: Voice = {
  id: 'oliver', display_name: 'Oliver', gender: 'male', locale: 'en-US', tags: ['use-case:podcast'],
  preview_audio: 'https://cdn/oliver.mp3', models: models('simba-3.2'),
};
const hans: Voice = {
  id: 'hans', display_name: 'Hans', gender: 'male', locale: 'de-DE', tags: ['use-case:podcast'],
  preview_audio: 'https://cdn/hans.mp3', models: models('simba-3.0'),
};
const silent: Voice = { id: 'silent', display_name: 'Silent', gender: 'male', locale: 'en-US', models: models('simba-3.2') };

const makePlayer = (overrides: Partial<PreviewPlayer> = {}): PreviewPlayer => ({
  playingKey: null,
  status: 'idle',
  toggle: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn(),
  ...overrides,
});

describe('SampleButton', () => {
  it('plays the sample of its voice and does not trigger the surrounding click', async () => {
    const player = makePlayer();
    const outer = vi.fn();
    render(<div onClick={outer}><SampleButton voice={alicia} player={player} /></div>);

    await userEvent.click(screen.getByRole('button', { name: 'Play sample of Alicia' }));

    expect(player.toggle).toHaveBeenCalledWith('alicia', 'https://cdn/alicia.mp3');
    expect(outer).not.toHaveBeenCalled();
  });

  it('shows the stop state only for the voice that is playing', () => {
    const player = makePlayer({ playingKey: 'alicia', status: 'playing' });
    render(<><SampleButton voice={alicia} player={player} /><SampleButton voice={oliver} player={player} /></>);

    expect(screen.getByRole('button', { name: 'Stop sample of Alicia' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Play sample of Oliver' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders nothing when the voice has no sample', () => {
    const { container } = render(<SampleButton voice={silent} player={makePlayer()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('VoiceCard', () => {
  it('shows the voice, its language and the model and opens the picker on click', async () => {
    const onOpen = vi.fn();
    render(<VoiceCard voice={alicia} language="en-US" model="simba-3.2" isLoading={false} player={makePlayer()} onOpen={onOpen} />);

    expect(screen.getByText('Alicia')).toBeInTheDocument();
    expect(screen.getByText('Female · English (US)')).toBeInTheDocument();
    expect(screen.getByText('Simba 3.2')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Voice: Alicia/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('is disabled while the voices load', () => {
    render(<VoiceCard voice={undefined} language="en-US" model="simba-3.2" isLoading player={makePlayer()} onOpen={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Choose a voice' })).toBeDisabled();
    expect(screen.getByText('Loading voices...')).toBeInTheDocument();
  });
});

describe('VoicePickerModal', () => {
  const setup = (props: Partial<React.ComponentProps<typeof VoicePickerModal>> = {}) => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const player = makePlayer();
    render(
      <VoicePickerModal
        isOpen
        onClose={onClose}
        voices={[alicia, oliver, hans]}
        selectedVoiceId="alicia"
        language="en-US"
        player={player}
        onSelect={onSelect}
        {...props}
      />,
    );
    return { onSelect, onClose, player, user: userEvent.setup() };
  };

  const listed = () => within(screen.getByRole('list', { name: 'Voices' })).getAllByRole('listitem').map((li) => li.textContent);

  it('starts filtered to the language of the text', () => {
    setup();
    expect(listed()).toHaveLength(2);
    expect(screen.getByRole('status')).toHaveTextContent('2 voices');
  });

  it('searches by name and keeps the sample buttons usable after searching', async () => {
    const { user, player } = setup();

    await user.type(screen.getByRole('searchbox', { name: 'Search voices' }), 'oli');
    expect(screen.getByRole('status')).toHaveTextContent('1 voice');

    await user.click(screen.getByRole('button', { name: 'Play sample of Oliver' }));
    expect(player.toggle).toHaveBeenCalledWith('oliver', 'https://cdn/oliver.mp3');
    // The dialog and the list are still there after a sample was started.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use Oliver' })).toBeInTheDocument();
  });

  it('filters by gender', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Female' }));
    expect(screen.getByRole('status')).toHaveTextContent('1 voice');
    expect(screen.getByRole('button', { name: 'Use Alicia' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use Oliver' })).not.toBeInTheDocument();
  });

  it('shows a way back when nothing matches and resets the filters', async () => {
    const { user } = setup();
    await user.type(screen.getByRole('searchbox', { name: 'Search voices' }), 'zzzz');
    expect(screen.getByText('No voice matches these filters.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show all voices' }));
    expect(screen.getByRole('status')).toHaveTextContent('3 voices');
  });

  it('selects a voice and closes', async () => {
    const { user, onSelect, onClose } = setup();
    await user.click(screen.getByRole('button', { name: 'Use Oliver' }));
    expect(onSelect).toHaveBeenCalledWith(oliver);
    expect(onClose).toHaveBeenCalled();
  });

  it('marks the current voice', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Use Alicia' })).toHaveAttribute('aria-current', 'true');
  });

  it('stops a playing sample when it is closed', () => {
    const player = makePlayer();
    const { rerender } = render(
      <VoicePickerModal isOpen onClose={vi.fn()} voices={[alicia]} selectedVoiceId="" language="en-US" player={player} onSelect={vi.fn()} />,
    );
    rerender(<VoicePickerModal isOpen={false} onClose={vi.fn()} voices={[alicia]} selectedVoiceId="" language="en-US" player={player} onSelect={vi.fn()} />);
    expect(player.stop).toHaveBeenCalled();
  });
});
