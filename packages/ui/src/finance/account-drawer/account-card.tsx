"use client";

import {
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { type CSSProperties, type MouseEvent, useEffect } from "react";

import { MerchantLogo } from "../../mint/logo/merchant-logo";
import { ease, morph, spring } from "../../mint/motion";
import { categoryVar } from "../category-tag/category-colors";
import { Privacy } from "../privacy/privacy";
import styles from "./account-drawer.module.css";
import {
  CARD_H,
  CARD_H_OPEN,
  CARD_RADIUS,
  CARD_RADIUS_OPEN,
  CARD_W,
  CARD_W_OPEN,
  CLOSED_SCALE,
  frostMask,
  glareAt,
  glareOpacity,
  kindColor,
  pointerOffset,
  punchFor,
  tiltFor,
} from "./card-motion";
import { ibanLastFour } from "./iban";
import { RollingIban } from "./rolling-iban";
import type { AccountKind } from "@keel/finance/accounts";
import { formatMoney } from "@keel/finance/money";

// The drawer's card (mint-pocs' AccountDetailsDrawer), reconverted into a
// bank account's card: the Wealthsimple artwork is a brand asset, so the
// faces are drawn with tokens, a surface in the categorical colour of the
// account's kind lit from the top, the print in white.
//
// Mechanism, kept: a pointer tilt on springs (TRAIL) summed with a click
// punch (plain values), so a click never fights the tilt; a glare sliding
// against the tilt and fading in with it; the click kicks the card away from
// the pointer in 50ms, then it flips on SNAP while it grows on the sheet
// curve; faces with backface-visibility hidden under preserve-3d; the frost
// spreading through a mask of radial gradients (1.8s on, 0.9s off), the print
// blurring by 0.5px behind it. Reduced motion: no tilt, no kick; the faces
// cross-fade and the card resizes at once.

const TRAIL = { stiffness: 320, damping: 27 };
const INSTANT = { duration: 0 } as const;
const KICK = { duration: 0.05, ease: "easeOut" } as const;

/** The card grows like a morph into a panel: 0.55s open, 0.4s close. */
export const grow = (open: boolean) => (open ? morph.open : morph.close);

export type AccountCardAccount = {
  readonly name: string;
  readonly institution?: {
    readonly name: string;
    readonly logoUrl?: string | null;
  } | null;
  readonly kind: AccountKind;
  readonly kindLabel: string;
  readonly balance: {
    readonly minor: number;
    readonly currency: string;
  } | null;
  readonly iban?: string | null;
};

export type AccountCardProps = {
  readonly account: AccountCardAccount;
  readonly open: boolean;
  /** The card was clicked: the kick has played, flip it now. */
  readonly onToggle: () => void;
  /** Frosted over: the account is hidden from totals. */
  readonly frozen: boolean;
  /** The IBAN on the back, revealed by the details' eye. */
  readonly revealed: boolean;
  /** The back's label over the kind ("Type"). */
  readonly kindHeading: string;
  readonly locale: string;
};

export function AccountCard({
  account,
  open,
  onToggle,
  frozen,
  revealed,
  kindHeading,
  locale,
}: AccountCardProps) {
  const reduce = useReducedMotion() ?? false;

  // Pointer tilt (springs) plus a click punch (plain values): the rotation.
  const tiltX = useSpring(0, TRAIL);
  const tiltY = useSpring(0, TRAIL);
  const punchX = useMotionValue(0);
  const punchY = useMotionValue(0);
  const rotateX = useTransform(() => tiltX.get() + punchX.get());
  const rotateY = useTransform(() => tiltY.get() + punchY.get());
  // The glare slides opposite to the tilt and fades in with its magnitude.
  const glareX = useTransform(() => glareAt(rotateX.get(), rotateY.get()).x);
  const glareY = useTransform(() => glareAt(rotateX.get(), rotateY.get()).y);
  const glareBackX = useTransform(glareX, (x) => 100 - x);
  const glare = useTransform(() => glareOpacity(rotateX.get(), rotateY.get()));
  const glareFront = useMotionTemplate`radial-gradient(130% 130% at ${glareX}% ${glareY}%, var(--glare), transparent 55%)`;
  const glareBack = useMotionTemplate`radial-gradient(200% 200% at ${glareBackX}% ${glareY}%, color-mix(in srgb, var(--glare) 50%, transparent), transparent 75%)`;

  const offset = (event: MouseEvent<HTMLElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return pointerOffset(box, event.clientX, event.clientY);
  };
  const onMove = (event: MouseEvent<HTMLElement>) => {
    if (reduce) return;
    const tilt = tiltFor(offset(event), open);
    tiltX.set(tilt.x);
    tiltY.set(tilt.y);
  };
  const onLeave = () => {
    tiltX.set(0);
    tiltY.set(0);
  };
  // Kick the card away from the click point, then flip and spring back.
  const onClick = (event: MouseEvent<HTMLElement>) => {
    if (reduce) {
      onToggle();
      return;
    }
    const punch = punchFor(offset(event));
    tiltX.set(0);
    tiltY.set(0);
    void animate(punchX, punch.x, KICK);
    void animate(punchY, punch.y, KICK).then(() => {
      onToggle();
      void animate(punchX, 0, spring.bounce);
      void animate(punchY, 0, spring.bounce);
    });
  };

  // Frost: 0 to 1 as the account leaves the totals; the mask spreads the
  // ice from the edges and five patches.
  const frost = useMotionValue(frozen ? 1 : 0);
  useEffect(() => {
    const controls = animate(frost, frozen ? 1 : 0, {
      duration: reduce ? 0 : frozen ? 1.8 : 0.9,
      ease: ease.sheet,
    });
    return () => controls.stop();
  }, [frozen, frost, reduce]);
  const mask = useTransform(frost, frostMask);

  const resize = reduce ? INSTANT : grow(open);
  // Reduced motion: the faces cross-fade in place instead of turning over.
  const face = (back: boolean) => ({
    borderRadius: open ? CARD_RADIUS_OPEN : CARD_RADIUS,
    ...(reduce ? { opacity: open === back ? 1 : 0 } : {}),
  });
  const faceTransition = reduce
    ? { borderRadius: INSTANT, opacity: { duration: 0.2, ease: ease.enter } }
    : resize;
  const printScale = { scale: open ? 1 : CLOSED_SCALE };

  const iban = account.iban ?? null;
  const institution = account.institution ?? null;
  const paint = {
    "--kind-color": categoryVar(kindColor(account.kind)),
  } as CSSProperties;

  return (
    <div className={styles.cardStage}>
      <motion.div
        className={styles.card}
        style={paint}
        onClick={onClick}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        whileHover={open || reduce ? undefined : { scale: 1.02 }}
        initial={false}
        animate={{
          width: open ? CARD_W_OPEN : CARD_W,
          height: open ? CARD_H_OPEN : CARD_H,
        }}
        transition={resize}
      >
        <motion.div className={styles.cardTilt} style={{ rotateX, rotateY }}>
          <motion.div
            className={styles.cardFlip}
            data-reduced={reduce || undefined}
            initial={false}
            animate={{ rotateY: open && !reduce ? 180 : 0 }}
            transition={reduce ? INSTANT : spring.snap}
          >
            {/* front */}
            <motion.div
              className={styles.face}
              initial={false}
              animate={face(false)}
              transition={faceTransition}
              aria-hidden={open}
            >
              <span className={styles.paint} />
              <motion.span
                className={styles.frost}
                style={{ maskImage: mask }}
              />
              <motion.div
                className={styles.print}
                data-frozen={frozen || undefined}
                initial={false}
                animate={printScale}
                transition={resize}
              >
                <div className={styles.printTop}>
                  {institution ? (
                    <span className={styles.institution}>
                      <MerchantLogo
                        name={institution.name}
                        src={institution.logoUrl}
                        size={28}
                      />
                      <span className={styles.printTitle}>
                        {institution.name}
                      </span>
                    </span>
                  ) : null}
                </div>
                <div className={styles.printRow}>
                  <div className={styles.printHolder}>
                    <div className={styles.printLabel}>{account.name}</div>
                    {account.balance ? (
                      <Privacy className={styles.printBalance}>
                        {formatMoney(
                          account.balance.minor,
                          account.balance.currency,
                          { locale },
                        )}
                      </Privacy>
                    ) : null}
                  </div>
                  {iban ? (
                    <div className={styles.printValue}>
                      •• {ibanLastFour(iban)}
                    </div>
                  ) : null}
                </div>
              </motion.div>
              <motion.span
                className={styles.glare}
                style={{ background: glareFront, opacity: glare }}
              />
            </motion.div>

            {/* back */}
            <motion.div
              className={`${styles.face} ${styles.back}`}
              initial={false}
              animate={face(true)}
              transition={faceTransition}
              aria-hidden={!open}
            >
              <span className={styles.paint} />
              <motion.span
                className={styles.frost}
                style={{ maskImage: mask }}
              />
              <motion.span
                className={styles.glare}
                style={{ background: glareBack, opacity: glare }}
              />
              {/* laid out at the open size and scaled down with the card */}
              <motion.div
                className={styles.print}
                data-frozen={frozen || undefined}
                initial={false}
                animate={printScale}
                transition={resize}
              >
                <div className={styles.printTop}>
                  {institution ? (
                    <MerchantLogo
                      name={institution.name}
                      src={institution.logoUrl}
                      size={28}
                    />
                  ) : (
                    <span />
                  )}
                  <div className={styles.printMeta}>
                    <div className={styles.printLabel}>{kindHeading}</div>
                    <div className={styles.printValue}>{account.kindLabel}</div>
                  </div>
                </div>
                <div className={styles.printHolder}>
                  <div className={styles.printLabel}>{account.name}</div>
                  {iban ? (
                    <RollingIban
                      iban={iban}
                      revealed={revealed}
                      className={styles.printNumber}
                    />
                  ) : (
                    <div className={styles.printNumber}>
                      {institution?.name}
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  );
}
