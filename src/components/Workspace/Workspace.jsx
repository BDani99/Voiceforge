import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { Type, X, Plus } from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import Header from '../Header/Header';
import VoiceSettings from '../VoiceSettings/VoiceSettings';
import RightPanel from '../RightPanel/RightPanel';
import PlaybackControls from '../PlaybackControls/PlaybackControls';
import ParagraphControl from '../ParagraphControl/ParagraphControl';
import Presets from '../Presets/Presets';
import ConfirmModal from '../ConfirmModal/ConfirmModal';
import { useVoiceSettings } from '../../hooks/useVoiceSettings';
import { useSpeechify } from '../../hooks/useSpeechify';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import { useConfirm } from '../../hooks/useConfirm';
import '../../App.css';

function Workspace() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  // Custom hooks for business logic
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();
  const voiceSettings = useVoiceSettings();
  const speechify = useSpeechify(voiceSettings, projectId);
  const audioPlayer = useAudioPlayer(speechify, voiceSettings, setIsLoading, confirm);



  useEffect(() => {
    const handleKeyDown = async (e) => {
      const isInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';
      
      if (e.ctrlKey && e.key === 'Enter') {
        // Generate all ungenerated
        toast('Generating all blocks...', { icon: '⚡' });
        for (let i = 0; i < speechify.paragraphs.length; i++) {
          if (speechify.paragraphs[i].text.trim() && !speechify.paragraphs[i].isGenerated) {
            await speechify.generateParagraphAudio(i, false);
          }
        }
      } else if (e.code === 'Space' && !isInput) {
        e.preventDefault();
        audioPlayer.handlePlayAll();
      } else if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        toast.success('Project synced manually (Auto-save is also active)');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [speechify, audioPlayer]);

  useEffect(() => {
    const handleFallback = (e) => {
      toast(e.detail.message, {
        icon: '⚠️',
        style: {
          borderRadius: '10px',
          background: '#1e293b',
          color: '#f8fafc',
          border: '1px solid #f59e0b'
        },
      });
    };
    window.addEventListener('speechify-fallback-warning', handleFallback);
    return () => window.removeEventListener('speechify-fallback-warning', handleFallback);
  }, []);



  // Derived state
  const totalParagraphs = speechify.paragraphs.filter(p => p.text.trim()).length;
  const generatedCount = speechify.generatedParagraphs.size;

  const handleResetAll = () => {
    speechify.resetSpeechify();
    audioPlayer.resetAudioPlayer();
    voiceSettings.resetSettings();
  };

  const currentPresetSettings = {
    language: speechify.selectedLanguage,
    voice: speechify.selectedVoice,
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

  const applyPreset = (settings) => {
    if (settings.language) speechify.handleLanguageChange(settings.language);
    if (settings.voice) speechify.handleVoiceChange(settings.voice);
    if (settings.globalDefaults) {
      Object.entries(settings.globalDefaults).forEach(([k, v]) => voiceSettings.updateGlobalDefaults(k, v));
    }
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
                        title="Add new paragraph at the beginning"
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
                        onUpdate={speechify.updateParagraph}
                        onDelete={speechify.deleteParagraph}
                        onPlay={audioPlayer.handlePlayParagraph}
                        onGenerate={speechify.generateParagraphAudio}
                        onPreview={speechify.generatePreviewAudio}
                        onSplitText={speechify.handleSplitText}
                        isPlaying={audioPlayer.currentPlayingIndex === index && audioPlayer.isPlaying}
                        isGenerating={speechify.generatingIndex === index}
                        isGenerated={speechify.generatedParagraphs.has(index)}
                        globalDefaults={voiceSettings.globalDefaults}
                        currentEmotion={voiceSettings.emotion}
                        isFirstParagraph={index === 0}
                        useFadeTransitions={voiceSettings.useFadeTransitions}
                        globalAudio={audioPlayer.getGlobalAudio}
                        isPlayingAll={audioPlayer.isPlayingAll}
                        currentPlayingIndex={audioPlayer.currentPlayingIndex}
                        stopGlobalPlay={audioPlayer.resetAudioPlayer}
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
            selectedVoice={speechify.selectedVoice}
            handleVoiceChange={speechify.handleVoiceChange}
            isLoading={isLoading}
            isLoadingVoices={speechify.isLoadingVoices}
            voices={speechify.voices}
            emotion={voiceSettings.emotion}
            setEmotion={voiceSettings.setEmotion}
            globalEmphasis={voiceSettings.globalEmphasis}
            handleEmphasisChange={voiceSettings.handleEmphasisChange}
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
            globalCustomReplacements={voiceSettings.globalCustomReplacements}
            handleCustomReplacementsChange={voiceSettings.handleCustomReplacementsChange}
            error={speechify.error}
            voiceSettingsComponent={
              <VoiceSettings
                globalDefaults={voiceSettings.globalDefaults}
                updateGlobalDefaults={voiceSettings.updateGlobalDefaults}
                pauseStrength={voiceSettings.pauseStrength}
                setPauseStrength={voiceSettings.setPauseStrength}
                usePauseCustom={voiceSettings.usePauseCustom}
                setUsePauseCustom={voiceSettings.setUsePauseCustom}
                pauseCustomTime={voiceSettings.pauseCustomTime}
                setPauseCustomTime={voiceSettings.setPauseCustomTime}
              />
            }
            presetsComponent={
              <Presets 
                currentSettings={currentPresetSettings} 
                onApplyPreset={applyPreset} 
              />
            }
          />
        </div>

        <PlaybackControls
          handlePlayAll={audioPlayer.handlePlayAll}
          skipToParagraph={audioPlayer.skipToParagraph}
          paragraphs={speechify.paragraphs}
          totalParagraphs={totalParagraphs}
          isPlayingAll={audioPlayer.isPlayingAll}
          currentPlayingIndex={audioPlayer.currentPlayingIndex}
          generatingIndex={speechify.generatingIndex}
        />
      </div>
    </div>
  );
}

export default Workspace;
