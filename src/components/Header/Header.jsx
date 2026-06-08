import React from 'react';
import PropTypes from 'prop-types';
import { Sparkles, FileAudio, RefreshCw, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './Header.css';

/**
 * Header component for the application.
 */
function Header({ handleExportAll, handleResetAll, isLoading, totalParagraphs }) {
  const navigate = useNavigate();

  return (
    <header className="app-header">
      <div className="header-left">
        <button className="back-to-dashboard-btn" onClick={() => navigate('/dashboard')} title="Back to Dashboard">
          <ArrowLeft size={20} />
        </button>
        <div className="logo">
          <Sparkles size={32} />
          <h1>VoiceForge</h1>
        </div>
      </div>
      <div className="header-right">
        <button
          onClick={handleExportAll}
          disabled={isLoading || totalParagraphs === 0}
          className="export-all-btn"
          title="Export all paragraphs as single audio file"
        >
          <FileAudio size={20} />
          <span>Export All</span>
        </button>
        <button
          onClick={handleResetAll}
          className="reset-btn"
          title="Clear all text and settings"
        >
          <RefreshCw size={20} />
        </button>
      </div>
    </header>
  );
}

Header.propTypes = {
  handleExportAll: PropTypes.func.isRequired,
  handleResetAll: PropTypes.func.isRequired,
  isLoading: PropTypes.bool.isRequired,
  totalParagraphs: PropTypes.number.isRequired,
};

export default Header;
