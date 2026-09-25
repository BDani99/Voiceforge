import { ChevronRight, Fingerprint } from 'lucide-react';
import { genderLabel, isClonedVoice, localeLabel, modelLabel, voiceUseCases, voiceName } from '../../../../utils/voices';
import type { PreviewPlayer } from '../../../../hooks/usePreviewPlayer';
import type { Voice } from '../../../../types/models';
import SampleButton from './SampleButton';
import VoiceAvatar from './VoiceAvatar';
import './VoicePicker.css';

interface VoiceCardProps {
  voice: Voice | undefined;
  language: string;
  /** Model that will be used with this voice. */
  model: string;
  isLoading: boolean;
  disabled?: boolean;
  player: PreviewPlayer;
  onOpen: () => void;
}

/** The selected voice as a big button; clicking it opens the voice picker. */
export default function VoiceCard({ voice, language, model, isLoading, disabled = false, player, onOpen }: VoiceCardProps) {
  const details = voice ? [genderLabel(voice.gender), localeLabel(voice.locale ?? language)].filter(Boolean).join(' · ') : '';
  const tags = voice ? voiceUseCases(voice).slice(0, 1) : [];

  return (
    <div className="vc">
      <button
        type="button"
        className="vc__main"
        onClick={onOpen}
        disabled={disabled || isLoading}
        aria-haspopup="dialog"
        aria-label={voice ? `Voice: ${voiceName(voice)}. Click to choose another voice.` : 'Choose a voice'}
      >
        <VoiceAvatar voice={voice} size={48} />
        <span className="vc__text">
          {voice ? (
            <>
              <span className="vc__name">{voiceName(voice)}</span>
              <span className="vc__details">{details}</span>
              <span className="vc__chips">
                <span className="vp-chip vp-chip--model">{modelLabel(model)}</span>
                {isClonedVoice(voice) && (
                  <span className="vp-chip vp-chip--cloned"><Fingerprint size={11} aria-hidden="true" /> Cloned</span>
                )}
                {tags.map((tag) => <span key={tag} className="vp-chip">{tag}</span>)}
              </span>
            </>
          ) : (
            <span className="vc__name">{isLoading ? 'Loading voices...' : 'Choose a voice'}</span>
          )}
        </span>
        <ChevronRight size={18} className="vc__chevron" aria-hidden="true" />
      </button>
      {voice && (
        <div className="vc__sample">
          <SampleButton voice={voice} player={player} />
        </div>
      )}
    </div>
  );
}
