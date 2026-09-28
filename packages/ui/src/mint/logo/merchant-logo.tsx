"use client";

import { useState } from "react";

import { TransferIcon } from "../icons/icons";
import styles from "./merchant-logo.module.css";

export type MerchantLogoProps = {
  /** The merchant's name, for the lettermark when there is no logo. */
  readonly name: string;
  /** The logo URL the API stitched into the row; null for none. */
  readonly src?: string | null;
  /** Money moving between the household's own accounts: the exchange glyph. */
  readonly transfer?: boolean;
  readonly size?: number;
};

/**
 * The round mark a merchant is shown by: its logo in a hairline frame, its
 * initial on inverted ink when the logo is missing or fails to load, the
 * exchange glyph for money between accounts. Decorative: the row names it.
 */
export function MerchantLogo({
  name,
  src,
  transfer,
  size = 32,
}: MerchantLogoProps) {
  const [failed, setFailed] = useState<string | null>(null);
  if (transfer) {
    return (
      <span
        className={styles.logo}
        data-glyph
        style={{ width: size, height: size }}
        aria-hidden
      >
        <TransferIcon size={Math.round(size / 2)} />
      </span>
    );
  }
  const showImage = Boolean(src) && src !== failed;
  return (
    <span
      className={styles.logo}
      data-lettermark={showImage ? undefined : true}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {showImage ? (
        <img
          className={styles.image}
          src={src ?? undefined}
          alt=""
          loading="lazy"
          decoding="async"
          ref={(element) => {
            if (element?.complete)
              element.decode().catch(() => setFailed(src ?? null));
          }}
          onError={() => setFailed(src ?? null)}
        />
      ) : (
        name.trim().charAt(0).toUpperCase()
      )}
    </span>
  );
}
