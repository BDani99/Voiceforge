import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useCaptionExport } from './useCaptionExport';
import type { Paragraph } from '../types/models';
import type { SpeechMarks } from '../utils/speechMarks';

const mocks = vi.hoisted(() => ({ download: vi.fn(), duration: vi.fn(), fetchAudioBlob: vi.fn() }));

vi.mock('../utils/download', () => ({ downloadBlob: mocks.download }));
vi.mock('../utils/audioDuration', () => ({ audioDurationMs: mocks.duration }));
vi.mock('../services/audioStorage', () => ({ fetchAudioBlob: mocks.fetchAudioBlob }));

const marks = (words: [number, number, number, number][], durationMs: number): SpeechMarks => ({ durationMs, words });

const paragraph = (id: string, text: string, patch: Partial<Paragraph> = {}): Paragraph => ({
  id, text, audioBlob: new Blob([id]), audioUrl: null, isGenerated: true, wasCached: false, emotion: '', segments: [], marks: [], speechMarks: null, ...patch,
});

function setup(paragraphs: Paragraph[], { gap = 0, confirmAnswer = true, generated }: { gap?: number; confirmAnswer?: boolean; generated?: Blob | null } = {}) {
  const setError = vi.fn();
  const setIsLoading = vi.fn();
  const showConfirm = vi.fn(() => Promise.resolve(confirmAnswer));
  const generateParagraphAudio = vi.fn(() => Promise.resolve(generated === undefined ? new Blob(['generated']) : generated));
  const getSpeechMarks = vi.fn((): SpeechMarks | null => null);
  const { result } = renderHook(() => useCaptionExport(
    { paragraphs, generateParagraphAudio, getSpeechMarks, setError },
    { useParagraphGap: gap > 0, paragraphGapPause: gap },
    setIsLoading,
    showConfirm,
  ));
  return { exportCaptions: result.current, setError, setIsLoading, showConfirm, generateParagraphAudio, getSpeechMarks };
}

const downloaded = async (): Promise<{ text: string; type: string; name: string }> => {
  const [blob, name] = mocks.download.mock.calls[0] as [Blob, string];
  return { text: await blob.text(), type: blob.type, name };
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.duration.mockResolvedValue(2000);
});

describe('useCaptionExport', () => {
  const a = paragraph('a', 'Hello world.', { speechMarks: marks([[0, 5, 100, 500], [6, 12, 600, 1200]], 2000) });
  const b = paragraph('b', 'Second one here.', { speechMarks: marks([[0, 6, 100, 700], [7, 10, 800, 1100], [11, 16, 1200, 1800]], 2000) });

  it('writes SRT with paragraphs one after another, including the pause between them', async () => {
    const { exportCaptions, showConfirm } = setup([a, b], { gap: 500 });
    await act(async () => { await exportCaptions('srt'); });

    expect(showConfirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Export subtitles' }));
    const file = await downloaded();
    expect(file.name).toMatch(/^voiceforge-\d+\.srt$/);
    expect(file.type).toContain('subrip');
    // second paragraph starts after 2000 ms of audio + 500 ms pause, plus its own first word at 100 ms
    expect(file.text).toContain('1\n00:00:00,100 --> ');
    expect(file.text).toContain('Hello world.');
    expect(file.text).toContain('2\n00:00:02,600 --> ');
    expect(file.text).toContain('Second one here.');
  });

  it('writes WebVTT', async () => {
    const { exportCaptions } = setup([a], { gap: 0 });
    await act(async () => { await exportCaptions('vtt'); });
    const file = await downloaded();
    expect(file.name).toMatch(/\.vtt$/);
    expect(file.text.startsWith('WEBVTT\n\n')).toBe(true);
    expect(file.text).toContain('00:00:00.100 --> ');
  });

  it('does nothing when the user declines', async () => {
    const { exportCaptions, setIsLoading } = setup([a], { confirmAnswer: false });
    await act(async () => { await exportCaptions('srt'); });
    expect(mocks.download).not.toHaveBeenCalled();
    expect(setIsLoading).not.toHaveBeenCalled();
  });

  it('tells about estimated timing for audio without word timings and still exports', async () => {
    const old = paragraph('c', 'Old audio without any timings at all.');
    const { exportCaptions, showConfirm } = setup([old]);
    await act(async () => { await exportCaptions('srt'); });

    const details = (showConfirm.mock.calls[0] as unknown as [{ details: { text: string }[] }])[0].details.map((d) => d.text).join('\n');
    expect(details).toMatch(/Exact word timing: 0 of 1/);
    expect(details).toMatch(/estimated/);
    expect((await downloaded()).text).toContain('Old audio without any timings at all.');
  });

  it('generates paragraphs that have no audio yet and uses their fresh timings', async () => {
    const fresh = paragraph('d', 'Brand new text.', { audioBlob: null, isGenerated: false });
    const { exportCaptions, generateParagraphAudio, getSpeechMarks } = setup([fresh]);
    getSpeechMarks.mockReturnValue(marks([[0, 5, 50, 400], [6, 9, 450, 700], [10, 14, 750, 1000]], 2000));

    await act(async () => { await exportCaptions('srt'); });

    expect(generateParagraphAudio).toHaveBeenCalledWith(0, false);
    expect(getSpeechMarks).toHaveBeenCalledWith('d');
    expect((await downloaded()).text).toContain('00:00:00,050');
  });

  it('skips empty paragraphs and reports when there is nothing to export', async () => {
    const { exportCaptions, setError, showConfirm } = setup([paragraph('e', '   ')]);
    await act(async () => { await exportCaptions('srt'); });
    expect(setError).toHaveBeenCalledWith('No paragraphs to export!');
    expect(showConfirm).not.toHaveBeenCalled();
  });

  it('reports a failure and always ends the loading state', async () => {
    const { exportCaptions, setError, setIsLoading } = setup([paragraph('f', 'Text.', { audioBlob: null, isGenerated: false })], { generated: null });
    await act(async () => { await exportCaptions('srt'); });
    expect(setError).toHaveBeenLastCalledWith('Subtitle export failed: No audio generated');
    expect(setIsLoading).toHaveBeenLastCalledWith(false);
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('downloads stored audio that is not in memory instead of regenerating it', async () => {
    mocks.fetchAudioBlob.mockResolvedValue(new Blob(['stored']));
    const stored = paragraph('g', 'Stored audio text.', { audioBlob: null, audioUrl: 'https://cdn/x.wav', speechMarks: marks([[0, 6, 0, 500], [7, 12, 550, 900], [13, 17, 950, 1200]], 1500) });
    const { exportCaptions, generateParagraphAudio } = setup([stored]);
    await act(async () => { await exportCaptions('srt'); });
    expect(mocks.fetchAudioBlob).toHaveBeenCalledWith('https://cdn/x.wav');
    expect(generateParagraphAudio).not.toHaveBeenCalled();
    expect(mocks.download).toHaveBeenCalled();
  });
});
