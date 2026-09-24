import { useState, type ReactNode } from 'react';
import { Volume2, Settings2, X, BookOpen } from 'lucide-react';
import { SUPPORTED_LANGUAGES, EMOTION_OPTIONS, EMPHASIS_OPTIONS } from '../../../../constants/voiceConstants';
import Dictionary from '../Dictionary/Dictionary';
import Accordion from '../../../../components/Accordion/Accordion';
import Modal from '../../../../components/Modal/Modal';
import CustomSelect from '../../../../components/CustomSelect/CustomSelect';
import { usePreviewPlayer } from '../../../../hooks/usePreviewPlayer';
import type { DictionaryApi } from '../../../../hooks/useDictionary';
import type { GlobalDefaults, Voice } from '../../../../types/models';
import VoiceCard from '../VoicePicker/VoiceCard';
import VoicePickerModal from '../VoicePicker/VoicePickerModal';
import VoiceSettings from '../VoiceSettings/VoiceSettings';
import PauseSettings from '../VoiceSettings/PauseSettings';
import ModelSelector from '../ModelSelector/ModelSelector';
import './RightPanel.css';

interface RightPanelProps {
  selectedLanguage: string;
  handleLanguageChange: (language: string) => void;
  voices: Voice[];
  /** The selected voice (undefined until the list has loaded). */
  voice: Voice | undefined;
  onSelectVoice: (voice: Voice) => void;
  isLoading: boolean;
  isLoadingVoices: boolean;
  /** Model that is really used, and the user's choice ("auto" or a model name). */
  model: string;
  modelChoice: string;
  setModelChoice: (choice: string) => void;
  emotion: string;
  setEmotion: (emotion: string) => void;
  /** False for models without emotion support. */
  emotionSupported: boolean;
  globalEmphasis: string;
  handleEmphasisChange: (emphasis: string) => void;
  globalDefaults: GlobalDefaults;
  updateGlobalDefaults: <K extends keyof GlobalDefaults>(field: K, value: GlobalDefaults[K]) => void;
  pauseStrength: string;
  setPauseStrength: (value: string) => void;
  usePauseCustom: boolean;
  setUsePauseCustom: (value: boolean) => void;
  pauseCustomTime: number;
  setPauseCustomTime: (value: number) => void;
  useFadeTransitions: boolean;
  setUseFadeTransitions: (enabled: boolean) => void;
  fadeInDuration: number;
  setFadeInDuration: (ms: number) => void;
  fadeOutDuration: number;
  setFadeOutDuration: (ms: number) => void;
  useParagraphGap: boolean;
  setUseParagraphGap: (enabled: boolean) => void;
  paragraphGapPause: number;
  setParagraphGapPause: (ms: number) => void;
  dictionary: DictionaryApi;
  error?: string;
  presetsComponent?: ReactNode;
}

function RightPanel({
  selectedLanguage,
  handleLanguageChange,
  voices,
  voice,
  onSelectVoice,
  isLoading,
  isLoadingVoices,
  model,
  modelChoice,
  setModelChoice,
  emotion,
  setEmotion,
  emotionSupported,
  globalEmphasis,
  handleEmphasisChange,
  globalDefaults,
  updateGlobalDefaults,
  pauseStrength,
  setPauseStrength,
  usePauseCustom,
  setUsePauseCustom,
  pauseCustomTime,
  setPauseCustomTime,
  useFadeTransitions,
  setUseFadeTransitions,
  fadeInDuration,
  setFadeInDuration,
  fadeOutDuration,
  setFadeOutDuration,
  useParagraphGap,
  setUseParagraphGap,
  paragraphGapPause,
  setParagraphGapPause,
  dictionary,
  error,
  presetsComponent,
}: RightPanelProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const player = usePreviewPlayer();

  return (
    <div className="right-panel">
      <Accordion title="Voice & Language" icon={Volume2} defaultOpen={true}>
        <div className="setting-group">
          <label id="language-label">Language</label>
          <CustomSelect
            ariaLabel="Language"
            value={selectedLanguage}
            onChange={(val) => handleLanguageChange(val)}
            disabled={isLoading}
            options={SUPPORTED_LANGUAGES.map((lang) => ({ value: lang.code, label: lang.name }))}
          />
        </div>

        <div className="setting-group">
          <label>Voice</label>
          <VoiceCard
            voice={voice}
            language={selectedLanguage}
            model={model}
            isLoading={isLoadingVoices}
            disabled={isLoading}
            player={player}
            onOpen={() => setIsPickerOpen(true)}
          />
        </div>

        <VoiceSettings globalDefaults={globalDefaults} updateGlobalDefaults={updateGlobalDefaults} />

        <div className="setting-group rp-spaced">
          <label>Model</label>
          <ModelSelector
            voice={voice}
            language={selectedLanguage}
            choice={modelChoice}
            resolved={model}
            onChange={setModelChoice}
            disabled={isLoading}
          />
        </div>

        <div className="setting-group">
          <label>Emotion for all paragraphs</label>
          <CustomSelect
            ariaLabel="Emotion for all paragraphs"
            value={emotion}
            onChange={(val) => setEmotion(val)}
            disabled={!emotionSupported}
            options={[
              { value: '', label: 'None' },
              ...EMOTION_OPTIONS.map((emo) => ({ value: emo.value, label: `${emo.icon} ${emo.label}` })),
            ]}
          />
          <p className="rp-hint">
            {emotionSupported
              ? 'A single paragraph can use its own emotion, or highlighted parts, instead.'
              : 'The selected model does not support emotions. Choose Simba 3.2 or 3.0 to use them.'}
          </p>
        </div>

        <div className="setting-group">
          <label>Global Emphasis</label>
          <CustomSelect
            ariaLabel="Global emphasis"
            value={globalEmphasis}
            onChange={(val) => handleEmphasisChange(val)}
            disabled={!emotionSupported}
            options={[
              { value: '', label: 'None' },
              ...EMPHASIS_OPTIONS.map((option) => ({
                value: option,
                label: option.charAt(0).toUpperCase() + option.slice(1),
              })),
            ]}
          />
        </div>

        {error && (
          <div className="error-message" style={{ marginTop: '16px' }}>
            <X size={20} />
            <p>{error}</p>
          </div>
        )}
      </Accordion>

      {presetsComponent}

      <button className="open-settings-btn" onClick={() => setIsSettingsOpen(true)}>
        <Settings2 size={18} /> Advanced Audio Settings
      </button>

      <VoicePickerModal
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        voices={voices}
        selectedVoiceId={voice?.id ?? ''}
        language={selectedLanguage}
        player={player}
        onSelect={onSelectVoice}
      />

      <Modal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} title="Advanced Audio Settings">
        <div className="modal-settings-grid">
          <div className="modal-settings-column">
            <Accordion title="Transitions & Pauses" icon={Settings2} defaultOpen={true}>
              <div className="rp-advanced">
                <PauseSettings
                  pauseStrength={pauseStrength}
                  setPauseStrength={setPauseStrength}
                  usePauseCustom={usePauseCustom}
                  setUsePauseCustom={setUsePauseCustom}
                  pauseCustomTime={pauseCustomTime}
                  setPauseCustomTime={setPauseCustomTime}
                />

                <div className="setting-group">
                  <label className="checkbox-container">
                    <input
                      type="checkbox"
                      checked={useFadeTransitions}
                      onChange={(e) => setUseFadeTransitions(e.target.checked)}
                    />
                    <span style={{ fontSize: '0.85rem', marginLeft: '6px' }}>Enable fade transitions</span>
                  </label>
                  {useFadeTransitions && (
                    <div style={{ marginTop: '8px' }}>
                      <div className="range-container" style={{ marginBottom: '12px' }}>
                        <span className="rp-range-label">Fade In: {fadeInDuration}ms</span>
                        <input
                          type="range"
                          min="0"
                          max="500"
                          step="10"
                          value={fadeInDuration}
                          aria-label="Fade in in milliseconds"
                          onChange={(e) => setFadeInDuration(parseInt(e.target.value))}
                          className="global-range"
                        />
                      </div>
                      <div className="range-container">
                        <span className="rp-range-label">Fade Out: {fadeOutDuration}ms</span>
                        <input
                          type="range"
                          min="0"
                          max="500"
                          step="10"
                          value={fadeOutDuration}
                          aria-label="Fade out in milliseconds"
                          onChange={(e) => setFadeOutDuration(parseInt(e.target.value))}
                          className="global-range"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="setting-group">
                  <label className="checkbox-container">
                    <input
                      type="checkbox"
                      checked={useParagraphGap}
                      onChange={(e) => setUseParagraphGap(e.target.checked)}
                    />
                    <span style={{ fontSize: '0.85rem', marginLeft: '6px' }}>Pause between paragraphs</span>
                  </label>
                  {useParagraphGap && (
                    <div className="range-container">
                      <input
                        type="range"
                        min="0"
                        max="5000"
                        step="100"
                        value={paragraphGapPause}
                        aria-label="Pause between paragraphs in milliseconds"
                        onChange={(e) => setParagraphGapPause(parseInt(e.target.value))}
                        className="global-range"
                      />
                      <span className="range-value">{paragraphGapPause}ms</span>
                    </div>
                  )}
                </div>
              </div>
            </Accordion>
          </div>
          <div className="modal-settings-column">
            <Accordion title="Dictionary" icon={BookOpen} defaultOpen={true}>
              <div style={{ paddingTop: '8px' }}>
                <Dictionary dictionary={dictionary} />
              </div>
            </Accordion>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default RightPanel;
