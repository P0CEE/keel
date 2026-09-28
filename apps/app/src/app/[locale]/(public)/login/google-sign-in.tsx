"use client";

import { useSearchParams } from "next/navigation";

import { GoogleGlyph } from "./google-glyph";
import styles from "./login.module.css";
import { signInWithGoogle } from "@/lib/auth-client";
import { rememberAuthMethod, useLastAuthMethod } from "@/lib/last-auth-method";
import { safeReturnTo } from "@/lib/return-to";
import { useScopedI18n } from "@/locales/client";
import { Button } from "@keel/ui/mint/button";

/**
 * Mint's large primary Button, full width. The click's promise holds the
 * loading state while Better Auth fetches Google's URL; the page then leaves,
 * so the spinner turns until Google takes over.
 */
export function GoogleSignIn() {
  const t = useScopedI18n("login");
  const lastMethod = useLastAuthMethod();
  const returnTo = safeReturnTo(useSearchParams().get("return_to"));

  return (
    <div className={styles.action}>
      <Button
        size="large"
        fullWidth
        loadingLabel={t("loading")}
        onClick={() => {
          rememberAuthMethod("google");
          return signInWithGoogle(returnTo);
        }}
      >
        <GoogleGlyph />
        {t("continue_with_google")}
      </Button>
      {lastMethod === "google" ? (
        <span className={styles.lastUsed}>{t("last_used")}</span>
      ) : null}
    </div>
  );
}
