// A Button's click, kept pure: a click that returns a promise holds the
// loading state until it settles, and another click meanwhile does nothing.

/** What a Button's click may return: a promise holds the loading state. */
export type ClickResult = void | Promise<unknown>;

export type ClickGate = {
  /** Whether a click's promise is still running. */
  readonly isBusy: () => boolean;
  /**
   * Runs `click` unless an earlier one is still running. When it returns a
   * promise, the gate stays shut until that settles, then `onSettle` runs.
   * Returns the held promise (it rejects as the click's did), or null when
   * nothing is held.
   */
  readonly run: (
    click: () => ClickResult,
    onSettle: () => void,
  ) => Promise<unknown> | null;
};

export function createClickGate(): ClickGate {
  let busy = false;
  return {
    isBusy: () => busy,
    run(click, onSettle) {
      if (busy) return null;
      const result = click();
      if (!(result instanceof Promise)) return null;
      busy = true;
      return result.finally(() => {
        busy = false;
        onSettle();
      });
    },
  };
}
