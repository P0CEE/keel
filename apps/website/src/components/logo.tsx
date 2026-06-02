import { cn } from "@keel/ui/cn";

/**
 * The keel logo. Rendered as a rainbow-masked box rather than an `<img>`: the
 * logo silhouette (`public/images/logo.svg`) masks a box filled with the same
 * rainbow gradient as the headline, with a band sweeping across continuously
 * (see `.logo-rainbow` in globals.css). At rest the logo is the foreground
 * colour, so it stays legible in both light and dark.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "logo-rainbow inline-block aspect-[679/309] h-8",
        className,
      )}
    />
  );
}
