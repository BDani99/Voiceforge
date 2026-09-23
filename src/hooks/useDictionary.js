import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../services/supabase';
import { notify } from '../utils/notificationService';

/** Serialises entries into the "word -> pronunciation" lines parseCustomReplacements understands. */
const toReplacementText = (entries) => entries
  .map((e) => `${e.original_word} -> ${e.replacement_word}`)
  .join('\n');

// Sorted so the text (and therefore the audio cache hash) does not depend on database row order.
const sortEntries = (entries) => [...entries].sort((a, b) => (
  a.original_word.localeCompare(b.original_word) || a.replacement_word.localeCompare(b.replacement_word)
));

/**
 * The user's pronunciation dictionary. It is loaded as soon as the workspace opens, so
 * generation always uses it, and every change is reported to `onChange` as replacement text.
 */
export const useDictionary = (onChange) => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const apply = useCallback((next) => {
    const sorted = sortEntries(next);
    setEntries(sorted);
    onChangeRef.current(toReplacementText(sorted));
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data, error } = await supabase.from('dictionaries').select('*').eq('user_id', user.id);
      if (cancelled) return;

      if (error) {
        notify.error(error, 'Could not load your dictionary. Reload the page before generating audio.');
      } else {
        apply(data || []);
      }
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [apply]);

  const addEntry = useCallback(async (originalWord, replacementWord) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('dictionaries')
        .insert([{ user_id: user.id, original_word: originalWord, replacement_word: replacementWord }])
        .select();
      if (error) throw error;

      apply([...entries, data[0]]);
      notify.success('Word added to dictionary');
      return true;
    } catch (err) {
      notify.error(err, 'Failed to add word');
      return false;
    }
  }, [entries, apply]);

  const deleteEntry = useCallback(async (id) => {
    try {
      const { error } = await supabase.from('dictionaries').delete().eq('id', id);
      if (error) throw error;

      apply(entries.filter((e) => e.id !== id));
      notify.success('Word removed');
    } catch (err) {
      notify.error(err, 'Failed to remove word');
    }
  }, [entries, apply]);

  return { entries, loading, addEntry, deleteEntry };
};
