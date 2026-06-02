import { XIcon } from "./icons";

const X_URL = "https://x.com/P0CEE";

/** A fixed pill in the bottom-right corner linking to the author's X profile. */
export function XCredit() {
  return (
    <a
      href={X_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="@P0CEE on X"
      className="bg-card/80 ring-border text-foreground hover:bg-card fixed right-5 bottom-5 z-20 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium shadow-[0_4px_14px_-6px_rgba(0,0,0,0.18),0_1px_2px_rgba(0,0,0,0.06)] ring-1 backdrop-blur transition-colors"
    >
      <XIcon width={13} height={13} />
      <span>@P0CEE</span>
    </a>
  );
}
