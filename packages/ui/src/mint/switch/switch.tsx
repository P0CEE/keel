"use client";

import { Switch as BaseSwitch } from "@base-ui/react/switch";
import {
  animate,
  type AnimationPlaybackControlsWithThen,
  motion,
  useMotionValue,
  useReducedMotion,
} from "motion/react";
import {
  type ComponentPropsWithoutRef,
  type Ref,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { spring } from "../motion";
import {
  BEAT,
  knobX,
  LAND,
  LEAN,
  leanOrigin,
  STRETCH,
  type SwitchSize,
  toggleBeats,
} from "./knob";
import styles from "./switch.module.css";

// mint-pocs' Switch (src/demos/switch/SwitchDemo.tsx): Mint's 40x22 toggle
// on Base UI's Switch (keyboard, focus and role="switch" come free). The
// knob stretches toward the midpoint, lands compressed, then springs back
// round; hover leans it toward where it would go. `size="small"` is the
// 32x18 one the Earnings calendar sets beside 12px labels.

export type SwitchProps = Omit<
  ComponentPropsWithoutRef<typeof BaseSwitch.Root>,
  "ref" | "className"
> & {
  readonly ref?: Ref<HTMLSpanElement>;
  /** 40x22 by default; "small" is 32x18, for a switch beside 12px labels. */
  readonly size?: SwitchSize;
};

// Base UI's mouse event, which a caller's own hover handler also receives.
type HoverEvent = Parameters<NonNullable<SwitchProps["onMouseEnter"]>>[0];

type Running = RefObject<readonly AnimationPlaybackControlsWithThen[]>;

// The running animations are kept and stopped before the next sequence, so
// rapid toggles never fight.
function stopAll(running: Running) {
  running.current.forEach((controls) => controls.stop());
  running.current = [];
}

function playAll(
  running: Running,
  controls: readonly AnimationPlaybackControlsWithThen[],
) {
  running.current = controls;
  return Promise.all(controls);
}

/**
 * The switch. `aria-label` is required without a visible <label>. Props are
 * Base UI's: `defaultChecked`, or `checked` with `onCheckedChange`, and
 * `disabled`. With reduced motion the knob snaps.
 */
export function Switch({
  ref,
  checked,
  defaultChecked,
  onCheckedChange,
  onMouseEnter,
  onMouseLeave,
  size = "default",
  ...rest
}: SwitchProps) {
  const [isChecked, setChecked] = useState(checked ?? defaultChecked ?? false);
  const knob = useRef<SVGSVGElement>(null);
  const x = useMotionValue(0);
  const scaleX = useMotionValue(1);
  // the state the knob currently shows
  const animatedFor = useRef<boolean | null>(null);
  // true while the toggle sequence plays (hover must not interrupt it)
  const busy = useRef(false);
  // Read as a ref inside the effects, so a preference change never replays a toggle.
  const reducedMotion = useReducedMotion() ?? false;
  const reduceMotion = useRef(reducedMotion);
  reduceMotion.current = reducedMotion;
  const running = useRef<readonly AnimationPlaybackControlsWithThen[]>([]);

  useEffect(() => {
    if (checked !== undefined) setChecked(checked);
  }, [checked]);

  useEffect(() => {
    const target = knobX(isChecked, size);
    stopAll(running);

    // First paint: place the knob without animating.
    if (animatedFor.current === null) {
      x.jump(target);
      animatedFor.current = isChecked;
      return;
    }
    // Same state, new size: the knob rests at the new travel.
    if (animatedFor.current === isChecked) {
      x.jump(target);
      return;
    }
    if (reduceMotion.current) {
      x.jump(target);
      scaleX.jump(1);
      animatedFor.current = isChecked;
      return;
    }

    // Stretch toward the midpoint, land compressed, spring back round.
    const beats = toggleBeats(isChecked, size);
    if (knob.current) knob.current.style.transformOrigin = beats.origin;
    busy.current = true;
    let cancelled = false;
    void playAll(running, [
      animate(x, beats.midpoint, { duration: BEAT }),
      animate(scaleX, STRETCH, { duration: BEAT }),
    ])
      .then(() => {
        if (cancelled) return;
        return playAll(running, [
          animate(x, beats.target, { duration: BEAT }),
          animate(scaleX, LAND, { duration: BEAT }),
        ]);
      })
      .then(() => {
        if (cancelled) return;
        return playAll(running, [animate(scaleX, 1, spring.bounce)]);
      })
      .finally(() => {
        if (!cancelled) {
          busy.current = false;
          running.current = [];
        }
      });
    animatedFor.current = isChecked;
    return () => {
      cancelled = true;
      stopAll(running);
      busy.current = false;
    };
  }, [isChecked, size, x, scaleX]);

  const handleChange = useCallback<NonNullable<SwitchProps["onCheckedChange"]>>(
    (next, details) => {
      setChecked(next);
      onCheckedChange?.(next, details);
    },
    [onCheckedChange],
  );

  // Hover leans the knob toward where it would go (0.1s, Mint's fast duration).
  const handleMouseEnter = useCallback(
    (event: HoverEvent) => {
      onMouseEnter?.(event);
      if (busy.current || reduceMotion.current) return;
      if (knob.current)
        knob.current.style.transformOrigin = leanOrigin(isChecked);
      void animate(scaleX, LEAN, { duration: 0.1 });
    },
    [isChecked, scaleX, onMouseEnter],
  );

  const handleMouseLeave = useCallback(
    (event: HoverEvent) => {
      onMouseLeave?.(event);
      if (busy.current || reduceMotion.current) return;
      void animate(scaleX, 1, { duration: 0.1 });
    },
    [scaleX, onMouseLeave],
  );

  return (
    <BaseSwitch.Root
      ref={ref}
      className={styles.track}
      data-size={size}
      checked={checked}
      defaultChecked={defaultChecked}
      onCheckedChange={handleChange}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...rest}
    >
      <motion.svg
        ref={knob}
        className={styles.knob}
        viewBox="0 0 180 180"
        aria-hidden="true"
        style={{ x, scaleX }}
      >
        <circle cx="90" cy="90" r="90" />
      </motion.svg>
    </BaseSwitch.Root>
  );
}
