import { useEffect, useRef, useState } from 'react';
import { Download, RefreshCw, ArrowLeft, ChevronDown, FileText, Music } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import BrandMark from '../BrandMark/BrandMark';
import './Header.css';

export type ExportKind = 'audio' | 'srt' | 'vtt';

interface HeaderProps {
  /** Called with what the user wants to export. */
  onExport: (kind: ExportKind) => void | Promise<void>;
  handleResetAll: () => void | Promise<void>;
  isLoading: boolean;
  totalParagraphs: number;
}

const OPTIONS: { kind: ExportKind; label: string; hint: string; icon: typeof Download }[] = [
  { kind: 'audio', label: 'Audio', hint: 'All paragraphs as one file', icon: Music },
  { kind: 'srt', label: 'Subtitles (.srt)', hint: 'Timed to the audio, for most video editors', icon: FileText },
  { kind: 'vtt', label: 'Subtitles (.vtt)', hint: 'WebVTT, for web players and YouTube', icon: FileText },
];

/** Header of the workspace: navigation, export (audio and subtitles) and reset. */
function Header({ onExport, handleResetAll, isLoading, totalParagraphs }: HeaderProps) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const disabled = isLoading || totalParagraphs === 0;

  // The menu closes on Escape and when the user clicks somewhere else.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    const onPointer = (event: MouseEvent) => {
      if (menuRef.current && event.target instanceof Node && !menuRef.current.contains(event.target)) setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [menuOpen]);

  const choose = (kind: ExportKind) => {
    setMenuOpen(false);
    void onExport(kind);
  };

  return (
    <header className="app-header">
      <div className="header-left">
        <button className="back-to-dashboard-btn" onClick={() => navigate('/projects')} title="Back to Dashboard" aria-label="Back to Dashboard">
          <ArrowLeft size={20} />
        </button>
        <div className="logo">
          <BrandMark size={30} />
          <h1>VoiceForge</h1>
        </div>
      </div>
      <div className="header-right">
        <div className="export-menu" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            disabled={disabled}
            className="export-all-btn"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title="Export the project as audio or subtitles"
          >
            <Download size={20} />
            <span>Export</span>
            <ChevronDown size={16} aria-hidden="true" />
          </button>
          {menuOpen && (
            <div className="export-menu__list" role="menu" aria-label="Export">
              {OPTIONS.map(({ kind, label, hint, icon: Icon }) => (
                <button key={kind} type="button" role="menuitem" className="export-menu__item" onClick={() => choose(kind)}>
                  <Icon size={18} aria-hidden="true" />
                  <span className="export-menu__text">
                    <span className="export-menu__label">{label}</span>
                    <span className="export-menu__hint">{hint}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
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
