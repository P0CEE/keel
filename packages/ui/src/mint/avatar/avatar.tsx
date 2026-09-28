"use client";

import { useState } from "react";

import styles from "./avatar.module.css";

export type AvatarProps = {
  readonly initials: string;
  readonly src?: string | null;
  readonly size?: number;
};

/**
 * A member's photo, or their initials on the pill fill when there is none or
 * it fails to load. Decorative: the control around it says whose it is.
 */
export function Avatar({ initials, src, size = 28 }: AvatarProps) {
  const [failed, setFailed] = useState<string | null>(null);
  const showImage = Boolean(src) && src !== failed;
  return (
    <span
      className={styles.avatar}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {showImage ? (
        <img
          className={styles.image}
          src={src ?? undefined}
          alt=""
          // a cached image never fires `error`: decode it to catch a broken file
          ref={(element) => {
            if (element?.complete)
              element.decode().catch(() => setFailed(src ?? null));
          }}
          onError={() => setFailed(src ?? null)}
        />
      ) : (
        initials.slice(0, 2).toUpperCase()
      )}
    </span>
  );
}
