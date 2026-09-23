import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Plus, Trash2 } from 'lucide-react';
import LoadingScreen from '../../../../components/LoadingScreen/LoadingScreen';
import './Dictionary.css';

export default function Dictionary({ dictionary }) {
  const { entries, loading, addEntry, deleteEntry } = dictionary;
  const [originalWord, setOriginalWord] = useState('');
  const [replacementWord, setReplacementWord] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!originalWord.trim() || !replacementWord.trim()) return;

    if (await addEntry(originalWord.trim(), replacementWord.trim())) {
      setOriginalWord('');
      setReplacementWord('');
    }
  };

  if (loading) return <LoadingScreen text="Loading dictionary..." inline={true} />;

  return (
    <div className="dictionary-container">
      <h3>Custom Pronunciations</h3>
      <form onSubmit={handleSubmit} className="dictionary-form">
        <input aria-label="Original word"
          placeholder="Original word"
          value={originalWord}
          onChange={(e) => setOriginalWord(e.target.value)}
        />
        <input aria-label="Pronounce as"
          placeholder="Pronounce as"
          value={replacementWord}
          onChange={(e) => setReplacementWord(e.target.value)}
        />
        <button type="submit" disabled={!originalWord.trim() || !replacementWord.trim()}>
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
            <button onClick={() => deleteEntry(entry.id)} className="delete-btn" title="Delete" aria-label="Delete">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

Dictionary.propTypes = {
  dictionary: PropTypes.shape({
    entries: PropTypes.array.isRequired,
    loading: PropTypes.bool.isRequired,
    addEntry: PropTypes.func.isRequired,
    deleteEntry: PropTypes.func.isRequired,
  }).isRequired,
};
