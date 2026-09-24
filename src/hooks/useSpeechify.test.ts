import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { queryMock, type QueryMock } from '../test/queryMock';
import { useVoiceSettings } from './useVoiceSettings';
import { useSpeechify } from './useSpeechify';
import type * as NotificationService from '../utils/notificationService';
import type { SpeechMarks } from '../utils/speechMarks';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getVoices: vi.fn(),
  synthesize: vi.fn(),
  marks: vi.fn((): SpeechMarks | null => null),
  clearCache: vi.fn(),
  findCachedAudio: vi.fn(),
  storeAudio: vi.fn(),
  fetchAudioBlob: vi.fn(),
  applyFade: vi.fn(),
  notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('../services/supabase', () => ({ supabase: { from: mocks.from } }));
vi.mock('../services/speechifyService', () => ({
  default: {
    getVoices: mocks.getVoices,
    synthesize: mocks.synthesize,
    synthesizeDetailed: async (...args: unknown[]) => ({ blob: (await mocks.synthesize(...args)) as Blob, marks: mocks.marks() }),
    clearCache: mocks.clearCache,
  },
}));
vi.mock('../services/audioStorage', () => ({
  findCachedAudio: mocks.findCachedAudio,
  storeAudio: mocks.storeAudio,
  fetchAudioBlob: mocks.fetchAudioBlob,
  getAudioHash: (payload: unknown) => Promise.resolve(`hash-${JSON.stringify(payload).length}`),
}));
vi.mock('../utils/audioProcessing', () => ({ applyFade: mocks.applyFade }));
vi.mock('../utils/notificationService', async (importOriginal) => ({
  ...(await importOriginal<typeof NotificationService>()),
  notify: mocks.notify,
}));

const PROJECT = '11111111-1111-1111-1111-111111111111';
const row = (id: string, content: string, audio_url: string | null = null): { id: string; content: string; audio_url: string | null; order_index: number; project_id: string; settings: Record<string, unknown> } => ({
  id,
  content,
  audio_url,
  order_index: 0,
  project_id: PROJECT,
  settings: {},
});

let paragraphsTable: QueryMock;

function useHarness(projectId: string | undefined = PROJECT) {
  const settings = useVoiceSettings();
  const speechify = useSpeechify(settings, projectId);
  return { settings, speechify };
}

/** Renders the hook, waits for the stored paragraphs to load and marks the dictionary as loaded. */
async function setup(rows: ReturnType<typeof row>[] = [row('p1', 'First'), row('p2', 'Second')]) {
  paragraphsTable = queryMock({ data: rows });
  const rendered = renderHook(() => useHarness());
  await waitFor(() => expect(rendered.result.current.speechify.paragraphs[0]?.id).toBe(rows[0]?.id ?? expect.anything()));
  act(() => rendered.result.current.settings.applyDictionary(''));
  return rendered;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.from.mockImplementation(() => paragraphsTable.builder);
  mocks.getVoices.mockResolvedValue([{ id: 'henry', locale: 'en-US' }]);
  mocks.findCachedAudio.mockResolvedValue(null);
  mocks.storeAudio.mockResolvedValue('https://cdn.example/a.wav');
  mocks.applyFade.mockImplementation((blob: Blob) => Promise.resolve(blob));
  mocks.synthesize.mockResolvedValue(new Blob(['audio'], { type: 'audio/mpeg' }));
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('loading', () => {
  it('loads the stored paragraphs and marks those with audio as generated', async () => {
    const { result } = await setup([row('p1', 'First', 'https://cdn.example/1.wav'), row('p2', 'Second')]);

    expect(result.current.speechify.paragraphs.map((p) => p.text)).toEqual(['First', 'Second']);
    expect([...result.current.speechify.generatedParagraphs]).toEqual([0]);
    expect(result.current.speechify.paragraphs[0]?.wasCached).toBe(true);
  });

  it('loads the voices and selects the first one', async () => {
    const { result } = await setup();
    await waitFor(() => expect(result.current.speechify.selectedVoice).toBe('henry'));
    expect(result.current.speechify.selectedLanguage).toBe('en-US');
  });

  it('prefers an English voice even when the list starts with another language', async () => {
    mocks.getVoices.mockResolvedValue([{ id: 'aadi', locale: 'hi-IN' }, { id: 'henry', locale: 'en-US' }]);
    const { result } = await setup();
    await waitFor(() => expect(result.current.speechify.selectedVoice).toBe('henry'));
    expect(result.current.speechify.selectedLanguage).toBe('en-US');
  });

  it('falls back to the first voice when there is no English one', async () => {
    mocks.getVoices.mockResolvedValue([{ id: 'aadi', locale: 'hi-IN' }]);
    const { result } = await setup();
    await waitFor(() => expect(result.current.speechify.selectedVoice).toBe('aadi'));
    expect(result.current.speechify.selectedLanguage).toBe('hi-IN');
  });

  it('reports a voice loading failure', async () => {
    mocks.getVoices.mockRejectedValue(new Error('Failed to fetch'));
    const { result } = await setup();
    await waitFor(() => expect(result.current.speechify.error).toMatch(/Failed to load voices/));
  });
});

describe('auto-save', () => {
  it('never saves before the stored paragraphs were loaded (regression: it wiped the project)', async () => {
    vi.useFakeTimers();
    let release: (value: unknown) => void = () => undefined;
    paragraphsTable = queryMock({ data: [] });
    // The load stays pending while the debounce time passes.
    const pending = new Promise((resolve) => { release = resolve; });
    mocks.from.mockImplementation(() => new Proxy({}, {
      get: (_t, prop) => (prop === 'then'
        ? (ok: (v: unknown) => unknown) => pending.then(() => ok({ data: [row('p1', 'Stored')], error: null }))
        : () => paragraphsTable.builder),
    }));

    renderHook(() => useHarness());
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });

    expect(paragraphsTable.calls.some((c) => c.method === 'upsert' || c.method === 'delete')).toBe(false);
    release(undefined);
  });

  it('does not save when loading failed, so stored content cannot be overwritten', async () => {
    paragraphsTable = queryMock({ error: { message: 'offline' } });
    vi.useFakeTimers();
    renderHook(() => useHarness());
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });

    expect(mocks.notify.error).toHaveBeenCalled();
    expect(paragraphsTable.calls.some((c) => c.method === 'upsert' || c.method === 'delete')).toBe(false);
  });

  it('saves edits after the debounce and removes deleted paragraphs', async () => {
    const { result } = await setup();
    vi.useFakeTimers();

    act(() => result.current.speechify.updateParagraphText(0, 'Edited'));
    await act(async () => { await vi.advanceTimersByTimeAsync(1600); });

    const upsert = paragraphsTable.argsOf('upsert');
    expect(upsert?.[0]).toEqual([
      expect.objectContaining({ id: 'p1', content: 'Edited', order_index: 0, project_id: PROJECT, audio_url: null }),
      expect.objectContaining({ id: 'p2', content: 'Second', order_index: 1 }),
    ]);
    expect(paragraphsTable.argsOf('not')).toEqual(['id', 'in', '(p1,p2)']);
  });

  it('flushes pending edits when the workspace is left', async () => {
    const { result, unmount } = await setup();
    act(() => result.current.speechify.updateParagraphText(1, 'Unsaved'));
    paragraphsTable.calls.length = 0;

    unmount();

    await waitFor(() => expect(paragraphsTable.argsOf('upsert')).toBeDefined());
    expect((paragraphsTable.argsOf('upsert')?.[0] as { content: string }[])[1]?.content).toBe('Unsaved');
  });
});

describe('editing', () => {
  it('editing a text discards its audio', async () => {
    const { result } = await setup([row('p1', 'First', 'https://cdn.example/1.wav')]);
    expect(result.current.speechify.paragraphs[0]?.isGenerated).toBe(true);

    act(() => result.current.speechify.updateParagraphText(0, 'Changed'));

    expect(result.current.speechify.paragraphs[0]).toMatchObject({ text: 'Changed', isGenerated: false, audioUrl: null });
  });

  it('splitting the first paragraph keeps all other paragraphs (regression: it replaced everything)', async () => {
    const { result } = await setup([row('p1', 'First'), row('p2', 'Second'), row('p3', 'Third')]);

    act(() => result.current.speechify.handleSplitText('Alpha\n\nBeta\n\nGamma'));

    expect(result.current.speechify.paragraphs.map((p) => p.text)).toEqual(['Alpha', 'Beta', 'Gamma', 'Second', 'Third']);
  });

  it('splits on single line breaks when there are no blank lines', async () => {
    const { result } = await setup([row('p1', 'x')]);
    act(() => result.current.speechify.handleSplitText('one\ntwo'));
    expect(result.current.speechify.paragraphs.map((p) => p.text)).toEqual(['one', 'two']);
  });

  it('adds and deletes paragraphs but always keeps one', async () => {
    const { result } = await setup([row('p1', 'Only')]);

    act(() => result.current.speechify.addParagraphAtStart());
    expect(result.current.speechify.paragraphs).toHaveLength(2);
    expect(result.current.speechify.paragraphs[0]?.text).toBe('');

    act(() => result.current.speechify.deleteParagraph(0));
    act(() => result.current.speechify.deleteParagraph(0));
    expect(result.current.speechify.paragraphs).toHaveLength(1);
    expect(result.current.speechify.paragraphs[0]?.text).toBe('');
  });
});

describe('generation', () => {
  it('generates, applies the fade, stores the file and marks the paragraph as generated', async () => {
    const { result } = await setup();
    await waitFor(() => expect(result.current.speechify.selectedVoice).toBe('henry'));

    let blob: Blob | null = null;
    await act(async () => {
      blob = await result.current.speechify.generateParagraphAudio(0);
    });

    expect(blob).toBeInstanceOf(Blob);
    expect(mocks.synthesize).toHaveBeenCalledWith(
      'First', 'henry', 'en-US', expect.any(Object),
      { forceRegenerate: false, action: 'generation', projectId: PROJECT, model: 'simba-3.2' },
    );
    expect(mocks.applyFade).toHaveBeenCalled();
    expect(mocks.storeAudio).toHaveBeenCalled();
    expect(result.current.speechify.paragraphs[0]).toMatchObject({
      isGenerated: true,
      audioUrl: 'https://cdn.example/a.wav',
      wasCached: false,
    });
  });

  it('keeps the word timings of the audio, stores them with it and drops them when the text changes', async () => {
    const marks: SpeechMarks = { durationMs: 900, words: [[0, 5, 50, 400]] };
    mocks.marks.mockReturnValue(marks);
    const { result } = await setup();
    await waitFor(() => expect(result.current.speechify.selectedVoice).toBe('henry'));

    await act(async () => {
      await result.current.speechify.generateParagraphAudio(0);
    });

    expect(result.current.speechify.paragraphs[0]?.speechMarks).toEqual(marks);
    expect(mocks.storeAudio).toHaveBeenCalledWith(expect.any(String), expect.any(Blob), marks);

    act(() => result.current.speechify.updateParagraphText(0, 'First, changed'));
    expect(result.current.speechify.paragraphs[0]?.speechMarks).toBeNull();
  });

  it('takes the word timings from the shared cache too', async () => {
    const marks: SpeechMarks = { durationMs: 500, words: [[0, 5, 10, 300]] };
    mocks.findCachedAudio.mockResolvedValue({ url: 'https://cdn.example/c.wav', blob: new Blob(['cached']), marks });
    const { result } = await setup();

    await act(async () => {
      await result.current.speechify.generateParagraphAudio(0);
    });

    expect(mocks.findCachedAudio).toHaveBeenCalledWith(expect.any(String), 'First'.length);
    expect(result.current.speechify.paragraphs[0]?.speechMarks).toEqual(marks);
  });

  it('loads the timings of stored audio from the cache table and ignores the ones that do not fit', async () => {
    mocks.from.mockImplementation((table: string) => (table === 'audio_cache'
      ? queryMock({
        data: [
          { audio_url: 'https://cdn.example/1.wav', speech_marks: { v: 1, durationMs: 900, words: [[0, 5, 50, 400]] } },
          { audio_url: 'https://cdn.example/2.wav', speech_marks: { v: 1, durationMs: 900, words: [[0, 50, 50, 400]] } },
        ],
      }).builder
      : paragraphsTable.builder));

    const { result } = await setup([row('p1', 'First', 'https://cdn.example/1.wav'), row('p2', 'Second', 'https://cdn.example/2.wav')]);

    expect(result.current.speechify.paragraphs[0]?.speechMarks).toEqual({ durationMs: 900, words: [[0, 5, 50, 400]] });
    expect(result.current.speechify.paragraphs[1]?.speechMarks).toBeNull(); // words beyond the text
  });

  it('uses the shared cache first and charges nothing', async () => {
    const cached = new Blob(['cached']);
    mocks.findCachedAudio.mockResolvedValue({ url: 'https://cdn.example/c.wav', blob: cached });
    const { result } = await setup();

    await act(async () => {
      await result.current.speechify.generateParagraphAudio(0);
    });

    expect(mocks.synthesize).not.toHaveBeenCalled();
    expect(result.current.speechify.paragraphs[0]).toMatchObject({ isGenerated: true, wasCached: true, audioBlob: cached });
  });

  it('skips the cache when regenerating on purpose', async () => {
    const { result } = await setup();
    await act(async () => {
      await result.current.speechify.generateParagraphAudio(0, true);
    });
    expect(mocks.findCachedAudio).not.toHaveBeenCalled();
    expect(mocks.synthesize).toHaveBeenCalledWith('First', expect.anything(), expect.anything(), expect.anything(), expect.objectContaining({ forceRegenerate: true }));
  });

  it('refuses to generate before the dictionary is loaded', async () => {
    paragraphsTable = queryMock({ data: [row('p1', 'First')] });
    const { result } = renderHook(() => useHarness());
    await waitFor(() => expect(result.current.speechify.paragraphs[0]?.id).toBe('p1'));

    await act(async () => {
      await result.current.speechify.generateParagraphAudio(0);
    });

    expect(mocks.synthesize).not.toHaveBeenCalled();
    expect(result.current.speechify.error).toMatch(/dictionary has not loaded/);
  });

  it('joins parallel requests for the same paragraph so it is charged once', async () => {
    let finish: (blob: Blob) => void = () => undefined;
    mocks.synthesize.mockReturnValue(new Promise<Blob>((resolve) => { finish = resolve; }));
    const { result } = await setup();

    let first: Promise<Blob | null> = Promise.resolve(null);
    let second: Promise<Blob | null> = Promise.resolve(null);
    act(() => {
      first = result.current.speechify.generateParagraphAudio(0);
      second = result.current.speechify.generateParagraphAudio(0);
    });
    await act(async () => {
      finish(new Blob(['audio']));
      await Promise.all([first, second]);
    });

    expect(mocks.synthesize).toHaveBeenCalledTimes(1);
  });

  it('shows a friendly message when generation fails and leaves the paragraph ungenerated', async () => {
    mocks.synthesize.mockRejectedValue(new Error('Insufficient credits'));
    const { result } = await setup();

    let blob: Blob | null = new Blob();
    await act(async () => {
      blob = await result.current.speechify.generateParagraphAudio(0);
    });

    expect(blob).toBeNull();
    expect(result.current.speechify.error).toContain("You don't have enough credits");
    expect(result.current.speechify.paragraphs[0]?.isGenerated).toBe(false);
  });

  it('does nothing for empty paragraphs', async () => {
    const { result } = await setup([row('p1', '   ')]);
    let blob: Blob | null = new Blob();
    await act(async () => {
      blob = await result.current.speechify.generateParagraphAudio(0);
    });
    expect(blob).toBeNull();
    expect(mocks.synthesize).not.toHaveBeenCalled();
  });

  it('keeps the result attached to the right paragraph even if the list changes meanwhile', async () => {
    let finish: (blob: Blob) => void = () => undefined;
    mocks.synthesize.mockReturnValue(new Promise<Blob>((resolve) => { finish = resolve; }));
    const { result } = await setup([row('p1', 'First'), row('p2', 'Second')]);

    let pending: Promise<Blob | null> = Promise.resolve(null);
    act(() => {
      pending = result.current.speechify.generateParagraphAudio(1);
    });
    act(() => result.current.speechify.addParagraphAtStart()); // "Second" moves to index 2
    await act(async () => {
      finish(new Blob(['audio']));
      await pending;
    });

    const generated = result.current.speechify.paragraphs.filter((p) => p.isGenerated).map((p) => p.text);
    expect(generated).toEqual(['Second']);
  });
});

describe('emotion', () => {
  const optionsOfLastCall = () => mocks.synthesize.mock.calls[mocks.synthesize.mock.calls.length - 1]?.[3] as {
    emotion?: { enabled?: boolean; type?: string };
    emotionSegments?: { start: number; end: number; emotion: string }[];
  };

  it('uses the default emotion of all paragraphs unless the paragraph has its own', async () => {
    const { result } = await setup([row('p1', 'First'), row('p2', 'Second')]);
    act(() => result.current.settings.setEmotion('warm'));
    await waitFor(() => expect(result.current.settings.emotion).toBe('warm'));

    await act(async () => { await result.current.speechify.generateParagraphAudio(0); });
    expect(optionsOfLastCall().emotion).toEqual({ enabled: true, type: 'warm' });

    act(() => result.current.speechify.setParagraphEmotion(1, 'sad'));
    await act(async () => { await result.current.speechify.generateParagraphAudio(1); });
    expect(optionsOfLastCall().emotion).toEqual({ enabled: true, type: 'sad' });

    act(() => result.current.speechify.setParagraphEmotion(1, 'none'));
    await act(async () => { await result.current.speechify.generateParagraphAudio(1, true); });
    expect(optionsOfLastCall().emotion).toEqual({ enabled: false });
  });

  it('highlighted emotions replace the whole-paragraph emotion and are sent with the text', async () => {
    const { result } = await setup([row('p1', 'Hello brave world')]);
    act(() => result.current.settings.setEmotion('warm'));

    act(() => result.current.speechify.applyEmotionToRange(0, 6, 11, 'angry'));
    expect(result.current.speechify.paragraphs[0]).toMatchObject({ emotion: '', segments: [{ start: 6, end: 11, emotion: 'angry' }] });

    await act(async () => { await result.current.speechify.generateParagraphAudio(0); });
    expect(optionsOfLastCall().emotion).toEqual({ enabled: false }); // the default emotion does not wrap highlighted text
    expect(optionsOfLastCall().emotionSegments).toEqual([{ start: 6, end: 11, emotion: 'angry' }]);
  });

  it('a paragraph emotion and highlights exclude each other', async () => {
    const { result } = await setup([row('p1', 'Hello brave world')]);

    act(() => result.current.speechify.setParagraphEmotion(0, 'sad'));
    act(() => result.current.speechify.applyEmotionToRange(0, 0, 5, 'angry')); // blocked
    expect(result.current.speechify.paragraphs[0]).toMatchObject({ emotion: 'sad', segments: [] });

    act(() => result.current.speechify.setParagraphEmotion(0, ''));
    act(() => result.current.speechify.applyEmotionToRange(0, 0, 5, 'angry'));
    act(() => result.current.speechify.setParagraphEmotion(0, 'sad')); // blocked while highlights exist
    expect(result.current.speechify.paragraphs[0]).toMatchObject({ emotion: '', segments: [{ start: 0, end: 5, emotion: 'angry' }] });

    act(() => result.current.speechify.clearHighlights(0));
    act(() => result.current.speechify.setParagraphEmotion(0, 'sad'));
    expect(result.current.speechify.paragraphs[0]).toMatchObject({ emotion: 'sad', segments: [] });
  });

  it('clears the emotion of a highlighted range and keeps the rest', async () => {
    const { result } = await setup([row('p1', 'Hello brave new world')]);
    act(() => result.current.speechify.applyEmotionToRange(0, 0, 15, 'angry'));
    act(() => result.current.speechify.clearEmotionRange(0, 6, 11));
    expect(result.current.speechify.paragraphs[0]?.segments).toEqual([
      { start: 0, end: 6, emotion: 'angry' },
      { start: 11, end: 15, emotion: 'angry' },
    ]);
  });

  it('moves highlights along with edits of the text', async () => {
    const { result } = await setup([row('p1', 'Hello brave world')]);
    act(() => result.current.speechify.applyEmotionToRange(0, 6, 11, 'angry'));
    act(() => result.current.speechify.updateParagraphText(0, 'Oh, Hello brave world'));
    expect(result.current.speechify.paragraphs[0]?.segments).toEqual([{ start: 10, end: 15, emotion: 'angry' }]);
  });

  it('only discards the audio of the paragraph whose emotion changed', async () => {
    const { result } = await setup([row('p1', 'First', 'https://cdn.example/1.wav'), row('p2', 'Second', 'https://cdn.example/2.wav')]);
    act(() => result.current.speechify.setParagraphEmotion(0, 'sad'));
    expect(result.current.speechify.paragraphs.map((p) => p.isGenerated)).toEqual([false, true]);
  });

  it('saves and restores the emotion settings of a paragraph', async () => {
    const { result } = await setup([{ ...row('p1', 'Hello brave world'), settings: { emotion: '', segments: [{ start: 6, end: 11, emotion: 'angry' }] } }]);
    expect(result.current.speechify.paragraphs[0]?.segments).toEqual([{ start: 6, end: 11, emotion: 'angry' }]);

    vi.useFakeTimers();
    act(() => result.current.speechify.applyEmotionToRange(0, 0, 5, 'sad'));
    await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
    const rows = paragraphsTable.argsOf('upsert')?.[0] as { settings: { segments: unknown[] } }[];
    expect(rows[0]?.settings.segments).toHaveLength(2);
  });
});

describe('model', () => {
  it('uses the automatic model of the voice and lets the user override it', async () => {
    mocks.getVoices.mockResolvedValue([
      { id: 'henry', locale: 'en-US', models: ['simba-3.2', 'simba-3.0', 'simba-multilingual'].map((name) => ({ name, languages: [{ locale: 'en-US' }] })) },
    ]);
    const { result } = await setup([row('p1', 'First')]);
    await waitFor(() => expect(result.current.speechify.selectedVoice).toBe('henry'));
    expect(result.current.speechify.model).toBe('simba-3.2');

    act(() => result.current.settings.setModelChoice('simba-3.0'));
    expect(result.current.speechify.model).toBe('simba-3.0');

    await act(async () => { await result.current.speechify.generateParagraphAudio(0); });
    expect(mocks.synthesize.mock.calls[0]?.[4]).toMatchObject({ model: 'simba-3.0' });
  });

  it('ignores a manual model the voice cannot use', async () => {
    mocks.getVoices.mockResolvedValue([{ id: 'henry', locale: 'en-US', models: [{ name: 'simba-3.2', languages: [{ locale: 'en-US' }] }] }]);
    const { result } = await setup([row('p1', 'First')]);
    await waitFor(() => expect(result.current.speechify.selectedVoice).toBe('henry'));
    act(() => result.current.settings.setModelChoice('simba-multilingual'));
    expect(result.current.speechify.model).toBe('simba-3.2');
  });

  it('discards generated audio when the user changes the model', async () => {
    const { result } = await setup([row('p1', 'First', 'https://cdn.example/1.wav')]);
    await waitFor(() => expect(result.current.speechify.selectedVoice).toBe('henry'));
    expect(result.current.speechify.paragraphs[0]?.isGenerated).toBe(true);

    act(() => result.current.settings.setModelChoice('simba-3.0'));
    await waitFor(() => expect(result.current.speechify.paragraphs[0]?.isGenerated).toBe(false));
  });
});

describe('invalidation', () => {
  it('discards generated audio when an audio setting changes', async () => {
    const { result } = await setup([row('p1', 'First', 'https://cdn.example/1.wav')]);
    await waitFor(() => expect(result.current.speechify.selectedVoice).toBe('henry'));

    act(() => result.current.settings.setEmotion('sad'));

    await waitFor(() => expect(result.current.speechify.paragraphs[0]?.isGenerated).toBe(false));
    expect(mocks.clearCache).toHaveBeenCalled();
    expect(result.current.speechify.paragraphs[0]?.audioUrl).toBeNull();
  });

  it('treats the first dictionary load as the baseline, later dictionary changes invalidate', async () => {
    const { result } = await setup([row('p1', 'First', 'https://cdn.example/1.wav')]);
    await waitFor(() => expect(result.current.speechify.selectedVoice).toBe('henry'));
    expect(result.current.speechify.paragraphs[0]?.isGenerated).toBe(true); // baseline load did not wipe it

    act(() => result.current.settings.applyDictionary('GIF -> jif'));
    await waitFor(() => expect(result.current.speechify.paragraphs[0]?.isGenerated).toBe(false));
  });
});
