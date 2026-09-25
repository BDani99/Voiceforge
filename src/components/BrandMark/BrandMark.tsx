interface BrandMarkProps {
  /** Width and height in pixels. */
  size?: number;
  className?: string;
}

/**
 * The VoiceForge app icon (the same drawing as public/favicon.svg): five sound bars on a rounded
 * square in the primary colour. It sits next to the name, so it is decorative for screen readers.
 */
export default function BrandMark({ size = 28, className }: BrandMarkProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="32" height="32" rx="8" fill="var(--color-primary)" />
      <path
        d="M8 13v6M12.5 9v14M17 12v8M21.5 7v18M26 14v4"
        fill="none"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
