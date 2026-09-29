import type { CSSProperties } from "react";

import { MerchantLogo } from "../../mint/logo/merchant-logo";
import styles from "./logo-stack.module.css";

// mint-pocs' crescent stack (AppTopBar's LogoStack, the Avatar demo's
// .av-stack): logos overlapping by a quarter of their size, each but the
// last cut by a crescent where the next one sits, so no ring is drawn and
// the stack reads on any fill. The profile's Portfolio pulse draws it big.

export type LogoStackProps = {
  readonly logos: readonly {
    readonly id: string;
    readonly name: string;
    readonly src: string | null;
  }[];
  /** px, one logo's size. */
  readonly size?: number;
};

export function LogoStack({ logos, size = 40 }: LogoStackProps) {
  return (
    <span
      className={styles.stack}
      style={{ "--logo": `${size}px` } as CSSProperties}
      aria-hidden="true"
    >
      {logos.map((logo) => (
        <span key={logo.id} className={styles.item}>
          <MerchantLogo name={logo.name} src={logo.src} size={size} />
        </span>
      ))}
    </span>
  );
}
