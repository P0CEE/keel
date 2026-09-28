"use client";

import { type RefObject, useLayoutEffect, useState } from "react";

export type Size = { readonly width: number; readonly height: number };

/** An element's layout size (untransformed), kept current; 0 until measured. */
export function useSize(ref: RefObject<HTMLElement | null>): Size {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const read = () =>
      setSize((current) =>
        current.width === element.offsetWidth &&
        current.height === element.offsetHeight
          ? current
          : { width: element.offsetWidth, height: element.offsetHeight },
      );
    read();
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}
