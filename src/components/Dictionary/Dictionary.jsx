import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { notify } from '../../utils/notificationService';
import { Plus, Trash2, Save, BookOpen } from 'lucide-react';
import Accordion from '../Accordion/Accordion';
import LoadingScreen from '../LoadingScreen/LoadingScreen';
import './Dictionary.css';

export default function Dictionary({ onUpdateGlobal }) {
  const [entries, setEntries] = useState([]);
  const [originalWord, setOriginalWord] = useState('');
  const [replacementWord, setReplacementWord] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDictionary();
  }, []);

  const fetchDictionary = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data, error } = await supabase
        .from('dictionaries')
        .select('*')
        .eq('user_id', user.id);
        
      if (error) throw error;
      setEntries(data || []);
      updateParentHook(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const updateParentHook = (data) => {
    // Convert to the text format expected by speechifyService
    const textFormat = data.map(d => `${d.original_word} -> ${d.replacement_word}`).join('\n');
    onUpdateGlobal(textFormat);
  };

  const addEntry = async (e) => {
    e.preventDefault();
    if (!originalWord.trim() || !replacementWord.trim()) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('dictionaries')
        .insert([{
          user_id: user.id,
          original_word: originalWord.trim(),
          replacement_word: replacementWord.trim()
        }])
        .select();
        
      if (error) throw error;
      const newEntries = [...entries, data[0]];
      setEntries(newEntries);
      setOriginalWord('');
      setReplacementWord('');
      updateParentHook(newEntries);
      notify.success('Word added to dictionary');
    } catch (err) {
      notify.error(err, 'Failed to add word');
    }
  };

  const deleteEntry = async (id) => {
    try {
      const { error } = await supabase.from('dictionaries').delete().eq('id', id);
      if (error) throw error;
      
      const newEntries = entries.filter(e => e.id !== id);
      setEntries(newEntries);
      updateParentHook(newEntries);
      notify.success('Word removed');
    } catch (err) {
      notify.error(err, 'Failed to remove word');
    }
  };

  if (loading) return <LoadingScreen text="Loading dictionary..." inline={true} />;

  return (
    <div className="dictionary-container">
      <h3>Custom Pronunciations</h3>
      <form onSubmit={addEntry} className="dictionary-form">
        <input 
          placeholder="Original word" 
          value={originalWord} 
          onChange={(e) => setOriginalWord(e.target.value)} 
        />
        <input 
          placeholder="Pronounce as" 
          value={replacementWord} 
          onChange={(e) => setReplacementWord(e.target.value)} 
        />
        <button type="submit" disabled={!originalWord || !replacementWord}>
          <Plus size={16} /> Add
        </button>
      </form>
      
      <div className="dictionary-list">
        {entries.map(entry => (
          <div key={entry.id} className="dictionary-item">
            <div className="dictionary-words">
              <span className="orig">{entry.original_word}</span>
              <span className="arrow">→</span>
              <span className="repl">{entry.replacement_word}</span>
            </div>
            <button onClick={() => deleteEntry(entry.id)} className="delete-btn" title="Delete">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
