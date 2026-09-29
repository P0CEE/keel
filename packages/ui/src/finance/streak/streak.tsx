import styles from "./streak.module.css";

// The profile's Streaks card, its row of marks: one circle per period
// (Wealthsimple's streak counts months with a deposit), a filled ring for a
// period kept, a dash for one missed, an empty ring for the one still
// running, each named under it.

export type StreakMark = {
  readonly id: string;
  /** Under the circle ("sept."). */
  readonly label: string;
  readonly state: "kept" | "missed" | "open";
  /** Said for the mark ("Septembre : tenu"). */
  readonly description: string;
};

export function StreakMarks({
  marks,
  label,
}: {
  readonly marks: readonly StreakMark[];
  /** The row's name ("Les quatre derniers mois"). */
  readonly label: string;
}) {
  return (
    <ol className={styles.marks} aria-label={label}>
      {marks.map((mark) => (
        <li key={mark.id} className={styles.mark} data-state={mark.state}>
          <span className={styles.circle} aria-hidden="true">
            {mark.state === "missed" ? <span className={styles.dash} /> : null}
          </span>
          <span className={styles.label} aria-hidden="true">
            {mark.label}
          </span>
          <span className={styles.sr}>{mark.description}</span>
        </li>
      ))}
    </ol>
  );
}
