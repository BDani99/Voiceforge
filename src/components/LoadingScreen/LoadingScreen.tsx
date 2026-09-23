import React from 'react';
import './LoadingScreen.css';

/**
 * Loading spinner used across pages.
 * @param {string} text - Optional loading message
 * @param {boolean} inline - If true, displays inline instead of full-screen
 */
export default function LoadingScreen({ text = 'Loading...', inline = false }) {
  return (
    <div className={`loading-screen ${inline ? 'inline' : ''}`}>
      <div className="loading-spinner"></div>
      <span className="loading-text">{text}</span>
    </div>
  );
}
