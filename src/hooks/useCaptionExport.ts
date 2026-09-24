import { useCallback } from 'react';
import { fetchAudioBlob } from '../services/audioStorage';
import { audioDurationMs } from '../utils/audioDuration';
import { buildCues, paragraphOffsets, toSrt, toVtt, type CaptionSource } from '../utils/captions';
import { downloadBlob } from '../utils/download';
import { getErrorMessage } from '../utils/notificationService';
import { estimateWords, type SpeechMarks } from '../utils/speechMarks';
import type { ConfirmFn } from './useConfirm';
import type { SpeechifyApi } from './useSpeechify';
import type { VoiceSettings } from './useVoiceSettings';

export type CaptionFormat = 'srt' | 'vtt';

const FORMATS: Record<CaptionFormat, { label: string; type: string; build: typeof toSrt }> = {
  srt: { label: 'SubRip (.srt)', type: 'application/x-subrip;charset=utf-8', build: toSrt },
  vtt: { label: 'WebVTT (.vtt)', type: 'text/vtt;charset=utf-8', build: toVtt },
};

interface Part {
  text: string;
  blob: Blob;
  marks: SpeechMarks | null;
}

/**
 * Exports the text of the project as subtitles that line up with the exported audio: every
 * paragraph starts where its audio starts in the joined file (after the pause between paragraphs).
 */
export function useCaptionExport(
  speechify: Pick<SpeechifyApi, 'paragraphs' | 'generateParagraphAudio' | 'getSpeechMarks' | 'setError'>,
  settings: Pick<VoiceSettings, 'useParagraphGap' | 'paragraphGapPause'>,
  setIsLoading: (loading: boolean) => void,
  showConfirm: ConfirmFn,
) {
  const { paragraphs, generateParagraphAudio, getSpeechMarks, setError } = speechify;
  const { useParagraphGap, paragraphGapPause } = settings;

  return useCallback(async (format: CaptionFormat) => {
    const filled = paragraphs.flatMap((p, index) => (p.text.trim() ? [{ p, index }] : []));
    if (filled.length === 0) {
      setError('No paragraphs to export!');
      return;
    }

    const generated = filled.filter(({ p }) => p.isGenerated);
    const exact = generated.filter(({ p }) => p.speechMarks).length;
    const estimated = generated.length - exact;
    const plural = estimated !== 1;

    const confirmed = await showConfirm({
      title: 'Export subtitles',
      details: [
        { icon: '📝', text: `Paragraphs: ${filled.length}` },
        { icon: '⏱️', text: `Exact word timing: ${exact} of ${generated.length} generated` },
        ...(estimated > 0
          ? [{ icon: '⚠️', text: `${estimated} paragraph${plural ? 's were' : ' was'} generated before word timings were kept: the timing of ${plural ? 'those' : 'that one'} is estimated. Regenerate for exact timing.` }]
          : []),
        { icon: '🔄', text: `Need to generate: ${filled.length - generated.length}` },
        { icon: '📄', text: FORMATS[format].label },
      ],
      message: 'The subtitles match the audio export, including the pause between paragraphs.',
      confirmLabel: 'Export',
      cancelLabel: 'Cancel',
    });
    if (!confirmed) return;

    setIsLoading(true);
    setError('');
    try {
      const parts: Part[] = [];

      for (const { p, index } of filled) {
        let blob: Blob | null = p.audioBlob;
        // Generated and stored but not in memory: fetch it from the stored URL.
        if (!blob && p.isGenerated && p.audioUrl) {
          try {
            blob = await fetchAudioBlob(p.audioUrl);
          } catch (e) {
            console.error('Failed to fetch from URL, regenerating...', e);
          }
        }
        blob ??= await generateParagraphAudio(index, false);
        if (!blob) continue;
        parts.push({ text: p.text, blob, marks: p.speechMarks ?? getSpeechMarks(p.id) });
      }
      if (parts.length === 0) throw new Error('No audio generated');

      const durations = await Promise.all(
        parts.map(async (part) => {
          const measured = await audioDurationMs(part.blob);
          return measured > 0 ? measured : part.marks?.durationMs ?? 0;
        }),
      );
      const offsets = paragraphOffsets(durations, useParagraphGap ? paragraphGapPause : 0);
      const sources: CaptionSource[] = parts.map((part, i) => ({
        text: part.text,
        words: part.marks?.words ?? estimateWords(part.text, durations[i] ?? 0),
        offsetMs: offsets[i] ?? 0,
      }));

      const cues = buildCues(sources);
      if (cues.length === 0) throw new Error('No subtitles could be created');

      const file = new Blob([FORMATS[format].build(cues)], { type: FORMATS[format].type });
      downloadBlob(file, `voiceforge-${Date.now()}.${format}`);
    } catch (err) {
      setError(`Subtitle export failed: ${getErrorMessage(err)}`);
    } finally {
      setIsLoading(false);
    }
  }, [paragraphs, generateParagraphAudio, getSpeechMarks, setError, setIsLoading, showConfirm, useParagraphGap, paragraphGapPause]);
}
