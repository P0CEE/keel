"use client";

import { useEffect } from "react";

import "./globals.css";
import styles from "./status-page.module.css";
import { Button } from "@keel/ui/mint/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      void import("@sentry/nextjs").then((Sentry) => {
        Sentry.captureException(error);
      });
    }
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className={styles.page}>
          <h1 className={styles.title}>Something went wrong</h1>
          <p className={styles.description}>
            An unexpected error occurred. Please try again.
          </p>
          <div className={styles.action}>
            <Button variant="primary" onClick={reset}>
              Try again
            </Button>
          </div>
        </main>
      </body>
    </html>
  );
}
