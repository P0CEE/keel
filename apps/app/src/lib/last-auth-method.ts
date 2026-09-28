"use client";

import { useEffect, useState } from "react";

// Which way the member signed in last on this browser, so the sign-in screen
// can mark it. Per device on purpose: it answers "what did I use here", and
// never leaks across devices or people.
const STORAGE_KEY = "ramnn:last-auth-method";

export type AuthMethod = "google";

export function rememberAuthMethod(method: AuthMethod): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, method);
  } catch {
    // Private mode or blocked storage: the mark is a nicety, nothing breaks.
  }
}

// Read in an effect, so the server render and the first client render agree
// and the mark appears a tick later.
export function useLastAuthMethod(): AuthMethod | null {
  const [method, setMethod] = useState<AuthMethod | null>(null);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "google") {
        setMethod("google");
      }
    } catch {
      // As above: no mark.
    }
  }, []);
  return method;
}
