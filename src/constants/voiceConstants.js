export const SUPPORTED_LANGUAGES = [
  { code: 'en-US', name: 'English (US)' },
  { code: 'en-GB', name: 'English (UK)' },
  { code: 'es-ES', name: 'Spanish' },
  { code: 'fr-FR', name: 'French' },
  { code: 'de-DE', name: 'German' },
  { code: 'it-IT', name: 'Italian' },
  { code: 'pt-BR', name: 'Portuguese' },
  { code: 'nl-NL', name: 'Dutch' },
  { code: 'pl-PL', name: 'Polish' },
  { code: 'sv-SE', name: 'Swedish' },
  { code: 'ja-JP', name: 'Japanese' },
  { code: 'ko-KR', name: 'Korean' },
  { code: 'zh-CN', name: 'Chinese (Simplified)' },
  { code: 'ru-RU', name: 'Russian' },
  { code: 'ar-SA', name: 'Arabic' },
  { code: 'hi-IN', name: 'Hindi' },
  { code: 'hu-HU', name: 'Hungarian' },
];

export const EMOTION_OPTIONS = [
  { value: 'angry', label: 'Angry', icon: '😠' },
  { value: 'cheerful', label: 'Cheerful', icon: '😄' },
  { value: 'sad', label: 'Sad', icon: '😢' },
  { value: 'terrified', label: 'Terrified', icon: '😱' },
  { value: 'relaxed', label: 'Relaxed', icon: '😌' },
  { value: 'fearful', label: 'Fearful', icon: '😨' },
  { value: 'surprised', label: 'Surprised', icon: '😲' },
  { value: 'calm', label: 'Calm', icon: '😐' },
  { value: 'assertive', label: 'Assertive', icon: '💪' },
  { value: 'energetic', label: 'Energetic', icon: '⚡' },
  { value: 'warm', label: 'Warm', icon: '🤗' },
  { value: 'direct', label: 'Direct', icon: '🎯' },
  { value: 'bright', label: 'Bright', icon: '✨' },
];

export const EMPHASIS_OPTIONS = ['reduced', 'moderate', 'strong'];

export const PAUSE_OPTIONS = ["none", "x-weak", "weak", "medium", "strong", "x-strong"];

export const PAUSE_INFO = {
  strength: {
    'none': '0ms (disabled)',
    'x-weak': '250ms',
    'weak': '500ms',
    'medium': '750ms',
    'strong': '1000ms',
    'x-strong': '1250ms'
  }
};
