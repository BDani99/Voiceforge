import { Loader2, Pause, Play } from 'lucide-react';
import type { PreviewPlayer } from '../../../../hooks/usePreviewPlayer';
import { voiceName, voicePreviewUrl } from '../../../../utils/voices';
import type { Voice } from '../../../../types/models';

interface SampleButtonProps {
  voice: Voice;
  player: PreviewPlayer;
  /** Locale of the sample; defaults to the voice's own language. */
  locale?: string;
}

/** Play / stop button for the sample recording of a voice. Renders nothing if there is none. */
export default function SampleButton({ voice, player, locale }: SampleButtonProps) {
  const url = voicePreviewUrl(voice, locale);
  if (!url) return null;

  const active = player.playingKey === voice.id;
  const status = active ? player.status : 'idle';
  const label = status === 'idle' ? `Play sample of ${voiceName(voice)}` : `Stop sample of ${voiceName(voice)}`;

  return (
    <button
      type="button"
      className={`vp-sample${active ? ' vp-sample--active' : ''}`}
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={(event) => {
        event.stopPropagation();
        void player.toggle(voice.id, url);
      }}
    >
      {status === 'loading' && <Loader2 size={16} className="spinning" />}
      {status === 'playing' && <Pause size={16} />}
      {status === 'idle' && <Play size={16} />}
    </button>
  );
}
