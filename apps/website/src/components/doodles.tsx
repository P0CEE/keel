import type { SVGProps } from "react";

/**
 * A clean four-point sparkle. Filled with `currentColor`, so the caller picks a
 * solid colour via a text utility. Decorative only.
 */
export function Sparkle(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" fill="currentColor" aria-hidden {...props}>
      <path d="M24 1.5c1.2 12 10.3 21.3 22.5 22.5C34.3 25.2 25.2 34.3 24 46.5 22.8 34.3 13.7 25.2 1.5 24 13.7 22.8 22.8 13.7 24 1.5Z" />
    </svg>
  );
}
