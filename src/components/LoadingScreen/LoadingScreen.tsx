import './LoadingScreen.css';

interface LoadingScreenProps {
  /** Loading message. */
  text?: string;
  /** Show inline instead of full-screen. */
  inline?: boolean;
}

/** Loading spinner used across pages. */
export default function LoadingScreen({ text = 'Loading...', inline = false }: LoadingScreenProps) {
  return (
    <div className={`loading-screen ${inline ? 'inline' : ''}`} role="status" aria-live="polite">
      <div className="loading-spinner" aria-hidden="true"></div>
      <span className="loading-text">{text}</span>
    </div>
  );
}
