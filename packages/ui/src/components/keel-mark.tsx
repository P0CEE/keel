type KeelMarkProps = {
  size?: number;
  className?: string;
};

/**
 * The keel mark — a hull in cross-section: the deck line across the top, the
 * curved hull beneath it, and the keel fin descending from its centre.
 */
export function KeelMark({ size = 28, className }: KeelMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="keel"
      className={className}
    >
      <path d="M4 8 H28" />
      <path d="M6 8 C6 15 9 20 16 20 C23 20 26 15 26 8" />
      <path d="M16 20 V26" />
    </svg>
  );
}
