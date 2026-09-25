import { useState } from 'react';
import { voiceInitials } from '../../../../utils/voices';
import type { Voice } from '../../../../types/models';

interface VoiceAvatarProps {
  voice: Voice | undefined;
  size?: number;
}

/** Deterministic hue so the same voice always gets the same fallback colour. */
function hueOf(id: string): number {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}

/** The voice's picture, or its initials on a colour when there is none (or it fails to load). */
export default function VoiceAvatar({ voice, size = 44 }: VoiceAvatarProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = voice?.avatar_image && voice.avatar_image !== failedUrl ? voice.avatar_image : null;
  const style = { width: size, height: size, fontSize: size * 0.36 };

  if (url) {
    return (
      <img
        className="vp-avatar"
        style={style}
        src={url}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailedUrl(url)}
      />
    );
  }

  const hue = voice ? hueOf(voice.id) : 220;
  return (
    <span
      className="vp-avatar vp-avatar--initials"
      style={{ ...style, background: `hsl(${hue} 42% 36%)` }}
      aria-hidden="true"
    >
      {voiceInitials(voice)}
    </span>
  );
}
