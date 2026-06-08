import React, { useMemo, useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Volume2, Settings2, Sliders, X, BookOpen } from 'lucide-react';
import { SUPPORTED_LANGUAGES, EMOTION_OPTIONS, EMPHASIS_OPTIONS } from '../../constants/voiceConstants';
import Dictionary from '../Dictionary/Dictionary';
import Accordion from '../Accordion/Accordion';
import Modal from '../Modal/Modal';
import CustomSelect from '../CustomSelect/CustomSelect';
import './RightPanel.css';

function RightPanel({
  selectedLanguage,
  handleLanguageChange,
  selectedVoice,
  handleVoiceChange,
  isLoading,
  isLoadingVoices,
  voices,
  emotion,
  setEmotion,
  globalEmphasis,
  handleEmphasisChange,
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
  globalCustomReplacements,
  handleCustomReplacementsChange,
  error,
  voiceSettingsComponent,
  presetsComponent
}) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedGender, setSelectedGender] = useState('');

  // Reset gender filter when language changes
  useEffect(() => {
    setSelectedGender('');
  }, [selectedLanguage]);

  const baseVoices = useMemo(() => {
    const exactMatches = voices.filter(v => v.locale === selectedLanguage);
    if (exactMatches.length > 0) return exactMatches;
    return voices.filter(v => v.locale === 'en-US' || v.locale === 'en-GB' || !v.locale);
  }, [voices, selectedLanguage]);

  const filteredVoices = useMemo(() => {
    if (!selectedGender) return baseVoices;
    const genderFiltered = baseVoices.filter(v => v.gender?.toLowerCase() === selectedGender);
    return genderFiltered.length > 0 ? genderFiltered : baseVoices;
  }, [baseVoices, selectedGender]);

  // Auto-select first voice when filter narrows list and current voice is no longer available
  useEffect(() => {
    if (filteredVoices.length > 0) {
      const voiceInList = filteredVoices.find(v => v.id === selectedVoice);
      if (!voiceInList) {
        handleVoiceChange(filteredVoices[0].id);
      }
    }
  }, [filteredVoices, selectedVoice, handleVoiceChange]);

  return (
    <div className="right-panel">
      {/* Voice & Language Accordion */}
      <Accordion title="Voice & Language" icon={Volume2} defaultOpen={true}>
        <div className="setting-group">
          <label htmlFor="language-select">Language</label>
          <CustomSelect
            value={selectedLanguage}
            onChange={(val) => handleLanguageChange(val)}
            disabled={isLoading}
            options={SUPPORTED_LANGUAGES.map((lang) => ({ value: lang.code, label: lang.name }))}
          />
        </div>

        <div className="setting-group">
          <label>Gender</label>
          <CustomSelect
            value={selectedGender}
            onChange={(val) => setSelectedGender(val)}
            disabled={isLoading}
            options={[
              { value: '', label: 'All' },
              { value: 'male', label: 'Male' },
              { value: 'female', label: 'Female' },
            ]}
          />
        </div>

        <div className="setting-group">
          <label htmlFor="voice-select">Voice</label>
          <CustomSelect
            value={selectedVoice}
            onChange={(val) => handleVoiceChange(val)}
            disabled={isLoadingVoices || isLoading}
            placeholder={isLoadingVoices ? "Loading voices..." : filteredVoices.length === 0 ? "No voices available" : "Select a voice"}
            options={filteredVoices.map((voice) => ({
              value: voice.id,
              label: `${voice.display_name || voice.name}${voice.gender ? ` • ${voice.gender}` : ''}`
            }))}
          />
        </div>

        <div className="setting-group">
          <label htmlFor="emotion-select">Emotion</label>
          <CustomSelect
            value={emotion}
            onChange={(val) => setEmotion(val)}
            options={[
              { value: "", label: "None" },
              ...EMOTION_OPTIONS.map((emo) => ({
                value: emo.value,
                label: `${emo.icon} ${emo.label}`
              }))
            ]}
          />
        </div>

        <div className="setting-group">
          <label htmlFor="global-emphasis">Global Emphasis</label>
          <CustomSelect
            value={globalEmphasis}
            onChange={(val) => handleEmphasisChange(val)}
            options={[
              { value: "", label: "None" },
              ...EMPHASIS_OPTIONS.map((option) => ({
                value: option,
                label: option.charAt(0).toUpperCase() + option.slice(1)
              }))
            ]}
          />
        </div>

        <div className="model-info" style={{ marginTop: '16px' }}>
          <p>
            <strong>Model:</strong> {selectedLanguage.startsWith('en') ? 'simba-english' : 'simba-multilingual'}
          </p>
          <p className="model-description">
            Optimized for {selectedLanguage.startsWith('en') ? 'English' : 'Multilingual'} synthesis
          </p>
        </div>

        {error && (
          <div className="error-message" style={{ marginTop: '16px' }}>
            <X size={20} />
            <p>{error}</p>
          </div>
        )}
      </Accordion>

      <button className="open-settings-btn" onClick={() => setIsSettingsOpen(true)}>
        <Settings2 size={18} /> Advanced Audio Settings
      </button>

      {/* Voice Presets */}
      {presetsComponent}

      {/* Advanced Settings Modal */}
      <Modal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)}
        title="Advanced Audio Settings"
      >
        <div className="modal-settings-grid">
          <div className="modal-settings-column">
            {voiceSettingsComponent}
          </div>
          <div className="modal-settings-column">
            <Accordion title="Transitions & Pauses" icon={Settings2} defaultOpen={true}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 'var(--space-xl)', paddingTop: '8px', alignItems: 'center' }}>
                <div className="setting-group">
                  <div className="transition-controls">
                    <label className="checkbox-container" style={{ marginBottom: '12px' }}>
                      <input
                        type="checkbox"
                        checked={useFadeTransitions}
                        onChange={(e) => setUseFadeTransitions(e.target.checked)}
                      />
                      <span style={{ fontSize: '0.85rem', marginLeft: '6px' }}>
                        Enable fade transitions
                      </span>
                    </label>
                    {useFadeTransitions && (
                      <div style={{ marginTop: '8px' }}>
                        <div className="range-container" style={{ marginBottom: '12px' }}>
                          <label style={{ fontSize: '0.8rem', textTransform: 'none' }}>Fade In: {fadeInDuration}ms</label>
                          <input
                            type="range"
                            min="0"
                            max="500"
                            step="10"
                            value={fadeInDuration}
                            onChange={(e) => setFadeInDuration(parseInt(e.target.value))}
                            className="global-range"
                          />
                        </div>
                        <div className="range-container">
                          <label style={{ fontSize: '0.8rem', textTransform: 'none' }}>Fade Out: {fadeOutDuration}ms</label>
                          <input
                            type="range"
                            min="0"
                            max="500"
                            step="10"
                            value={fadeOutDuration}
                            onChange={(e) => setFadeOutDuration(parseInt(e.target.value))}
                            className="global-range"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="setting-group">
                  <div className="paragraph-gap-control">
                    <label className="checkbox-container" style={{ marginBottom: '12px' }}>
                      <input
                        type="checkbox"
                        checked={useParagraphGap}
                        onChange={(e) => setUseParagraphGap(e.target.checked)}
                      />
                      <span style={{ fontSize: '0.85rem', marginLeft: '6px' }}>
                        Pause between paragraphs
                      </span>
                    </label>
                    {useParagraphGap && (
                      <div className="range-container">
                        <input
                          type="range"
                          min="0"
                          max="5000"
                          step="100"
                          value={paragraphGapPause}
                          onChange={(e) => setParagraphGapPause(parseInt(e.target.value))}
                          className="global-range"
                        />
                        <span className="range-value">{paragraphGapPause}ms</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Accordion>

            <Accordion title="Dictionary" icon={BookOpen} defaultOpen={true}>
              <div style={{ paddingTop: '8px' }}>
                <Dictionary onUpdateGlobal={handleCustomReplacementsChange} />
              </div>
            </Accordion>
          </div>
        </div>
      </Modal>
    </div>
  );
}

RightPanel.propTypes = {
  selectedLanguage: PropTypes.string.isRequired,
  handleLanguageChange: PropTypes.func.isRequired,
  selectedVoice: PropTypes.string.isRequired,
  handleVoiceChange: PropTypes.func.isRequired,
  isLoading: PropTypes.bool.isRequired,
  isLoadingVoices: PropTypes.bool.isRequired,
  voices: PropTypes.array.isRequired,
  emotion: PropTypes.string.isRequired,
  setEmotion: PropTypes.func.isRequired,
  globalEmphasis: PropTypes.string.isRequired,
  handleEmphasisChange: PropTypes.func.isRequired,
  useFadeTransitions: PropTypes.bool.isRequired,
  setUseFadeTransitions: PropTypes.func.isRequired,
  fadeInDuration: PropTypes.number.isRequired,
  setFadeInDuration: PropTypes.func.isRequired,
  fadeOutDuration: PropTypes.number.isRequired,
  setFadeOutDuration: PropTypes.func.isRequired,
  useParagraphGap: PropTypes.bool.isRequired,
  setUseParagraphGap: PropTypes.func.isRequired,
  paragraphGapPause: PropTypes.number.isRequired,
  setParagraphGapPause: PropTypes.func.isRequired,
  globalCustomReplacements: PropTypes.string.isRequired,
  handleCustomReplacementsChange: PropTypes.func.isRequired,
  error: PropTypes.string,
  voiceSettingsComponent: PropTypes.node,
  presetsComponent: PropTypes.node
};

export default RightPanel;
