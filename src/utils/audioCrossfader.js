class AudioCrossfader {
  constructor() {
    this.audioContext = null;
    this.initContext();
  }

  initContext() {
    if (typeof window !== 'undefined' && !this.audioContext) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioContext = new AudioContext();
      }
    }
  }

  async createFadedAudio(audioBlob, fadeInDuration = 0.1, fadeOutDuration = 0.1) {
    if (!this.audioContext) {
      console.warn('Web Audio API not available, returning original audio');
      return audioBlob;
    }

    try {
      // Resume context if suspended
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // Convert blob to array buffer
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer.slice(0));

      // Create offline context for processing
      const offlineContext = new OfflineAudioContext(
        audioBuffer.numberOfChannels,
        audioBuffer.length,
        audioBuffer.sampleRate
      );

      // Create buffer source
      const source = offlineContext.createBufferSource();
      source.buffer = audioBuffer;

      // Create gain node for fading
      const gainNode = offlineContext.createGain();
      
      // Set up fade curves
      const duration = audioBuffer.duration;
      gainNode.gain.setValueAtTime(0, 0);
      gainNode.gain.linearRampToValueAtTime(1, fadeInDuration);
      gainNode.gain.setValueAtTime(1, duration - fadeOutDuration);
      gainNode.gain.linearRampToValueAtTime(0, duration);

      // Connect nodes
      source.connect(gainNode);
      gainNode.connect(offlineContext.destination);

      // Start and render
      source.start(0);
      const renderedBuffer = await offlineContext.startRendering();

      // Convert back to blob
      const wavBlob = await this.bufferToWave(renderedBuffer);
      return wavBlob;
    } catch (error) {
      console.error('Error creating faded audio:', error);
      return audioBlob; // Return original on error
    }
  }

  async bufferToWave(audioBuffer) {
    const numberOfChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length * numberOfChannels * 2;
    const buffer = new ArrayBuffer(44 + length);
    const view = new DataView(buffer);

    // WAV header
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // PCM chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, audioBuffer.sampleRate, true);
    view.setUint32(28, audioBuffer.sampleRate * numberOfChannels * 2, true);
    view.setUint16(32, numberOfChannels * 2, true);
    view.setUint16(34, 16, true); // bits per sample
    writeString(36, 'data');
    view.setUint32(40, length, true);

    // Write PCM samples
    let offset = 44;
    for (let i = 0; i < audioBuffer.length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(channel)[i]));
        view.setInt16(offset, sample * 0x7FFF, true);
        offset += 2;
      }
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  async playWithFade(audioBlob, fadeInDuration = 0.05, fadeOutDuration = 0.05) {
    try {
      // Apply fade to the audio blob first
      const fadedBlob = await this.createFadedAudio(audioBlob, fadeInDuration, fadeOutDuration);
      
      // Create and return regular HTML5 Audio element
      const url = URL.createObjectURL(fadedBlob);
      const audio = new Audio(url);
      
      // Store URL for cleanup
      audio._blobUrl = url;
      
      // Clean up URL when audio ends
      const originalOnEnded = audio.onended;
      audio.onended = function() {
        if (audio._blobUrl) {
          URL.revokeObjectURL(audio._blobUrl);
          audio._blobUrl = null;
        }
        if (originalOnEnded) {
          originalOnEnded.call(this);
        }
      };
      
      return audio;
    } catch (error) {
      console.error('Error in playWithFade:', error);
      // Fallback to regular audio
      const url = URL.createObjectURL(audioBlob);
      const audio = new Audio(url);
      audio._blobUrl = url;
      return audio;
    }
  }

  cleanup() {
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
  }
}

// Initialize crossfader globally
const audioCrossfader = new AudioCrossfader();

export default audioCrossfader;
