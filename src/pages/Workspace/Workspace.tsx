import { useState, useEffect, useRef } from 'react';
import { notify } from '../../utils/notificationService';
import { Type, Plus } from 'lucide-react';
import { useParams } from 'react-router-dom';
import Header from '../../components/Header/Header';
import RightPanel from './components/RightPanel/RightPanel';
import PlaybackControls from './components/PlaybackControls/PlaybackControls';
import ParagraphControl from './components/ParagraphControl/ParagraphControl';
import PresetsPanel from './components/Presets/PresetsPanel';
import ConfirmModal from '../../components/ConfirmModal/ConfirmModal';
import { useVoiceSettings } from '../../hooks/useVoiceSettings';
import { useSpeechify } from '../../hooks/useSpeechify';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import { useConfirm } from '../../hooks/useConfirm';
import { useDictionary } from '../../hooks/useDictionary';
import { usePresets } from '../../hooks/usePresets';
import { supportsEmotion } from '../../utils/voices';
import type { PresetSettings } from '../../types/models';
import './Workspace.css';

function Workspace() {
  const { projectId } = useParams();
  const [isLoading, setIsLoading] = useState(false);

  // Custom hooks for business logic
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();
  const voiceSettings = useVoiceSettings();
  const dictionary = useDictionary(voiceSettings.applyDictionary);
  const speechify = useSpeechify(voiceSettings, projectId);
  const audioPlayer = useAudioPlayer(speechify, voiceSettings, setIsLoading, confirm);
  const isBatchRunningRef = useRef(false);

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Space must keep its normal meaning while typing or on a focused control.
      const target = e.target instanceof HTMLElement ? e.target : null;
      const isInteractive = !!target && (target.isContentEditable
        || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName));

      if (e.ctrlKey && e.key === 'Enter') {
        // Generate all ungenerated
        if (e.repeat || isBatchRunningRef.current) return;
        isBatchRunningRef.current = true;
        notify.info('Generating all blocks...');
        try {
          for (const [i, paragraph] of speechify.paragraphs.entries()) {
            if (paragraph.text.trim() && !paragraph.isGenerated) {
              await speechify.generateParagraphAudio(i, false);
            }
          }
        } finally {
          isBatchRunningRef.current = false;
        }
      } else if (e.code === 'Space' && !isInteractive) {
        e.preventDefault();
        audioPlayer.handlePlayAll();
      } else if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        notify.success('Project synced manually (Auto-save is also active)');
      }
    };
    const listener = (e: KeyboardEvent) => void handleKeyDown(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [speechify, audioPlayer]);

  useEffect(() => {
    const handleFallback = (e: CustomEvent<{ message: string }>) => {
      notify.warning(e.detail.message);
    };
    window.addEventListener('speechify-fallback-warning', handleFallback);
    return () => window.removeEventListener('speechify-fallback-warning', handleFallback);
  }, []);

  // Derived state
  const totalParagraphs = speechify.paragraphs.filter(p => p.text.trim()).length;
  const generatedCount = speechify.generatedParagraphs.size;

  const handleResetAll = async () => {
    // Auto-save would persist the cleared state, so this must be an explicit decision.
    const confirmed = await confirm({
      title: 'Clear everything?',
      message: 'This deletes all text of this project and resets your voice settings. It cannot be undone.',
      confirmLabel: 'Clear all',
      variant: 'danger',
    });
    if (!confirmed) return;

    speechify.resetSpeechify();
    audioPlayer.resetAudioPlayer();
    voiceSettings.resetSettings();
  };

  const currentPresetSettings: PresetSettings = {
    language: speechify.selectedLanguage,
    voice: speechify.selectedVoice,
    model: voiceSettings.modelChoice,
    globalDefaults: voiceSettings.globalDefaults,
    pauseStrength: voiceSettings.pauseStrength,
    usePauseCustom: voiceSettings.usePauseCustom,
    pauseCustomTime: voiceSettings.pauseCustomTime,
    paragraphGapPause: voiceSettings.paragraphGapPause,
    useParagraphGap: voiceSettings.useParagraphGap,
    useFadeTransitions: voiceSettings.useFadeTransitions,
    fadeInDuration: voiceSettings.fadeInDuration,
    fadeOutDuration: voiceSettings.fadeOutDuration,
    emotion: voiceSettings.emotion,
    globalEmphasis: voiceSettings.globalEmphasis
  };

  const applyPreset = (settings: PresetSettings) => {
    if (settings.language) speechify.handleLanguageChange(settings.language);
    if (settings.voice) {
      if (speechify.voices.some((v) => v.id === settings.voice)) speechify.handleVoiceChange(settings.voice);
      else notify.warning('The voice saved in this preset is no longer available. Pick another voice.');
    }
    if (settings.model !== undefined) voiceSettings.setModelChoice(settings.model);
    if (settings.globalDefaults) voiceSettings.replaceGlobalDefaults(settings.globalDefaults);
    if (settings.pauseStrength !== undefined) voiceSettings.setPauseStrength(settings.pauseStrength);
    if (settings.usePauseCustom !== undefined) voiceSettings.setUsePauseCustom(settings.usePauseCustom);
    if (settings.pauseCustomTime !== undefined) voiceSettings.setPauseCustomTime(settings.pauseCustomTime);
    if (settings.paragraphGapPause !== undefined) voiceSettings.setParagraphGapPause(settings.paragraphGapPause);
    if (settings.useParagraphGap !== undefined) voiceSettings.setUseParagraphGap(settings.useParagraphGap);
    if (settings.useFadeTransitions !== undefined) voiceSettings.setUseFadeTransitions(settings.useFadeTransitions);
    if (settings.fadeInDuration !== undefined) voiceSettings.setFadeInDuration(settings.fadeInDuration);
    if (settings.fadeOutDuration !== undefined) voiceSettings.setFadeOutDuration(settings.fadeOutDuration);
    if (settings.emotion !== undefined) voiceSettings.setEmotion(settings.emotion);
    if (settings.globalEmphasis !== undefined) voiceSettings.handleEmphasisChange(settings.globalEmphasis);
  };

  // The user's default preset is applied once, but only while nothing is generated (no audio is thrown away).
  const presets = usePresets({
    current: currentPresetSettings,
    onApply: applyPreset,
    autoApplyDefault: speechify.isLoaded && speechify.voices.length > 0 && speechify.generatedParagraphs.size === 0,
  });

  const emotionSupported = supportsEmotion(speechify.model);

  return (
    <div className="app">
      <ConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        details={confirmState.details}
        confirmLabel={confirmState.confirmLabel}
        cancelLabel={confirmState.cancelLabel}
        variant={confirmState.variant}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />

      <Header
        handleExportAll={audioPlayer.handleExportAll}
        handleResetAll={handleResetAll}
        isLoading={isLoading}
        totalParagraphs={totalParagraphs}
      />

      <div className="main-content">
        <div className="main-container">
          <div className="left-panel">
            <div className="paragraphs-section">
              <div className="section-header">
                <Type size={24} />
                <h2>Text</h2>
                <span className="generation-status">
                  {generatedCount} / {totalParagraphs} generated
                </span>
              </div>

              <div className="paragraphs-list">
                {speechify.paragraphs.length === 0 ? (
                  <div className="empty-state">
                    <Type size={48} />
                    <p>No paragraphs added yet.</p>
                    <p>Start typing or load a project.</p>
                  </div>
                ) : (
                  <>
                    {speechify.paragraphs.some(p => p.text.trim()) && (
                      <button
                        className="add-paragraph-top-btn"
                        onClick={speechify.addParagraphAtStart}
                        title="Add new paragraph at the beginning" aria-label="Add new paragraph at the beginning"
                      >
                        <Plus size={16} />
                        Add paragraph at beginning
                      </button>
                    )}
                    {speechify.paragraphs.map((paragraph, index) => (
                      <ParagraphControl
                        key={paragraph.id || index}
                        paragraph={paragraph}
                        index={index}
                        onUpdate={speechify.updateParagraphText}
                        onDelete={speechify.deleteParagraph}
                        onPlay={audioPlayer.handlePlayParagraph}
                        onGenerate={speechify.generateParagraphAudio}
                        onPreview={speechify.generatePreviewAudio}
                        onSplitText={speechify.handleSplitText}
                        isPlaying={audioPlayer.currentPlayingIndex === index && audioPlayer.isPlaying}
                        isGenerating={speechify.generatingIndex === index}
                        isGenerated={speechify.generatedParagraphs.has(index)}
                        globalDefaults={voiceSettings.globalDefaults}
                        defaultEmotion={voiceSettings.emotion}
                        emotionSupported={emotionSupported}
                        onSetEmotion={speechify.setParagraphEmotion}
                        onApplyEmotionToRange={speechify.applyEmotionToRange}
                        onClearEmotionRange={speechify.clearEmotionRange}
                        onClearHighlights={speechify.clearHighlights}
                        isFirstParagraph={index === 0}
                        getAudio={audioPlayer.getAudioFor}
                        onSeek={audioPlayer.seekParagraph}
                      />
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>

          <RightPanel
            selectedLanguage={speechify.selectedLanguage}
            handleLanguageChange={speechify.handleLanguageChange}
            voices={speechify.voices}
            voice={speechify.selectedVoiceInfo}
            onSelectVoice={(voice) => speechify.handleVoiceChange(voice.id)}
            isLoading={isLoading}
            isLoadingVoices={speechify.isLoadingVoices}
            model={speechify.model}
            modelChoice={voiceSettings.modelChoice}
            setModelChoice={voiceSettings.setModelChoice}
            emotion={voiceSettings.emotion}
            setEmotion={voiceSettings.setEmotion}
            emotionSupported={emotionSupported}
            globalEmphasis={voiceSettings.globalEmphasis}
            handleEmphasisChange={voiceSettings.handleEmphasisChange}
            globalDefaults={voiceSettings.globalDefaults}
            updateGlobalDefaults={voiceSettings.updateGlobalDefaults}
            pauseStrength={voiceSettings.pauseStrength}
            setPauseStrength={voiceSettings.setPauseStrength}
            usePauseCustom={voiceSettings.usePauseCustom}
            setUsePauseCustom={voiceSettings.setUsePauseCustom}
            pauseCustomTime={voiceSettings.pauseCustomTime}
            setPauseCustomTime={voiceSettings.setPauseCustomTime}
            useFadeTransitions={voiceSettings.useFadeTransitions}
            setUseFadeTransitions={voiceSettings.setUseFadeTransitions}
            fadeInDuration={voiceSettings.fadeInDuration}
            setFadeInDuration={voiceSettings.setFadeInDuration}
            fadeOutDuration={voiceSettings.fadeOutDuration}
            setFadeOutDuration={voiceSettings.setFadeOutDuration}
            useParagraphGap={voiceSettings.useParagraphGap}
            setUseParagraphGap={voiceSettings.setUseParagraphGap}
            paragraphGapPause={voiceSettings.paragraphGapPause}
            setParagraphGapPause={voiceSettings.setParagraphGapPause}
            dictionary={dictionary}
            error={speechify.error}
            presetsComponent={<PresetsPanel presets={presets} voices={speechify.voices} />}
          />
        </div>

        <PlaybackControls
          handlePlayAll={audioPlayer.handlePlayAll}
          skipToParagraph={audioPlayer.skipToParagraph}
          paragraphs={speechify.paragraphs}
          totalParagraphs={totalParagraphs}
          isPlayingAll={audioPlayer.isPlayingAll}
          isPausedAll={audioPlayer.isPausedAll}
          isPlaying={audioPlayer.isPlaying}
          currentPlayingIndex={audioPlayer.currentPlayingIndex}
          generatingIndex={speechify.generatingIndex}
          getAudioFor={audioPlayer.getAudioFor}
        />
      </div>
    </div>
  );
}

export default Workspace;
