import { Sparkles, Download, RefreshCw, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './Header.css';

interface HeaderProps {
  handleExportAll: () => void | Promise<void>;
  handleResetAll: () => void | Promise<void>;
  isLoading: boolean;
  totalParagraphs: number;
}

/** Header of the workspace: navigation, export and reset. */
function Header({ handleExportAll, handleResetAll, isLoading, totalParagraphs }: HeaderProps) {
  const navigate = useNavigate();

  return (
    <header className="app-header">
      <div className="header-left">
        <button className="back-to-dashboard-btn" onClick={() => navigate('/projects')} title="Back to Dashboard" aria-label="Back to Dashboard">
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
          title="Export all paragraphs as single audio file" aria-label="Export all paragraphs as single audio file"
        >
          <Download size={20} />
          <span>Export</span>
        </button>
        <button
          onClick={handleResetAll}
          className="reset-btn"
          title="Clear all text and settings" aria-label="Clear all text and settings"
        >
          <RefreshCw size={20} />
        </button>
      </div>
    </header>
  );
}

export default Header;
