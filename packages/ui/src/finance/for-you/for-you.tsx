"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type CSSProperties, type ReactNode, useState } from "react";

import { ChevronBackIcon, ChevronForwardIcon } from "../../mint/icons/icons";
import { spring } from "../../mint/motion";
import {
  type CategoryColor,
  categoryVar,
} from "../category-tag/category-colors";
import { stepWindow } from "../day-strip/pages";
import styles from "./for-you.module.css";

// Wealthsimple's "For you" on the home: one card at a time, "1 of 4" and
// the arrows, each card a prompt (its title, a line, the round arrow that
// acts, and its art: a ring in the card's colour around a glyph). The card
// slides the way it moved, on the snap spring; a flick drags to the next
// on a phone. Reduced motion swaps it.

export type ForYouCard = {
  readonly id: string;
  readonly title: string;
  readonly text: string;
  readonly color: CategoryColor;
  readonly glyph: ReactNode;
  /** The round arrow's name ("Voir les budgets"). */
  readonly action: string;
  readonly onAction: () => void;
};

export type ForYouProps = {
  readonly title: string;
  readonly cards: readonly ForYouCard[];
  readonly labels: {
    readonly position: (at: number, of: number) => string;
    readonly back: string;
    readonly forward: string;
  };
};

/** px a drag must travel, or its speed, to turn the card. */
const TURN = 60;

export function ForYou({ title, cards, labels }: ForYouProps) {
  const reduce = useReducedMotion() ?? false;
  const [at, setAt] = useState(0);
  const [direction, setDirection] = useState<-1 | 1>(1);
  const index = Math.min(at, Math.max(cards.length - 1, 0));
  const card = cards[index];
  if (card === undefined) return null;
  const step = (by: -1 | 1) => {
    const next = stepWindow(index, by, 1, cards.length);
    if (next === index) return;
    setDirection(by);
    setAt(next);
  };
  return (
    <section className={styles.forYou} aria-label={title}>
      <div className={styles.head}>
        <h2 className={styles.title}>{title}</h2>
        {cards.length > 1 ? (
          <span className={styles.nav}>
            <span className={styles.position} aria-live="polite">
              {labels.position(index + 1, cards.length)}
            </span>
            <button
              type="button"
              className={styles.arrow}
              aria-label={labels.back}
              disabled={index === 0}
              onClick={() => step(-1)}
            >
              <ChevronBackIcon size={16} />
            </button>
            <button
              type="button"
              className={styles.arrow}
              aria-label={labels.forward}
              disabled={index === cards.length - 1}
              onClick={() => step(1)}
            >
              <ChevronForwardIcon size={16} />
            </button>
          </span>
        ) : null}
      </div>
      <div className={styles.window}>
        <AnimatePresence initial={false} mode="popLayout" custom={direction}>
          <motion.article
            key={card.id}
            className={styles.card}
            style={{ "--card-tone": categoryVar(card.color) } as CSSProperties}
            initial={
              reduce ? { opacity: 0 } : { x: `${direction * 30}%`, opacity: 0 }
            }
            animate={{ x: 0, opacity: 1 }}
            exit={
              reduce ? { opacity: 0 } : { x: `${direction * -30}%`, opacity: 0 }
            }
            transition={reduce ? { duration: 0.15 } : spring.snap}
            drag={cards.length > 1 && !reduce ? "x" : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              if (info.offset.x < -TURN || info.velocity.x < -400) step(1);
              else if (info.offset.x > TURN || info.velocity.x > 400) step(-1);
            }}
          >
            <div className={styles.copy}>
              <h3 className={styles.cardTitle}>{card.title}</h3>
              <p className={styles.text}>{card.text}</p>
              <button
                type="button"
                className={styles.go}
                aria-label={card.action}
                onClick={card.onAction}
              >
                <ChevronForwardIcon size={16} />
              </button>
            </div>
            <span className={styles.art} aria-hidden="true">
              <span className={styles.glyph}>{card.glyph}</span>
            </span>
          </motion.article>
        </AnimatePresence>
      </div>
    </section>
  );
}
