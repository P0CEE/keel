import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";

import { GoogleSignIn } from "./google-sign-in";
import styles from "./login.module.css";
import login from "./login.webp";
import { getScopedI18n } from "@/locales/server";

export const metadata: Metadata = {
  title: "Login",
};

const websiteUrl =
  process.env.NEXT_PUBLIC_WEBSITE_URL ?? "http://localhost:3000";

/**
 * ramnn's sign-in, redrawn in Mint: the photograph with the name over it on
 * a desk, the one way in (Google) on the right, the terms at the foot.
 */
export default async function LoginPage() {
  const t = await getScopedI18n("login");

  return (
    <main className={styles.page}>
      <div className={styles.visual}>
        <Image
          src={login}
          alt=""
          fill
          priority
          sizes="60vw"
          placeholder="blur"
          className={styles.photo}
        />
        <div className={styles.caption}>
          <p className={styles.brand}>Ramnn</p>
          <p className={styles.tagline}>{t("tagline")}</p>
        </div>
      </div>

      <div className={styles.panel}>
        <p className={styles.mobileBrand}>Ramnn</p>
        <div className={styles.form}>
          <h1 className={styles.title}>{t("welcome_back")}</h1>
          <p className={styles.subtitle}>{t("subtitle")}</p>
          <Suspense>
            <GoogleSignIn />
          </Suspense>
          <p className={styles.divider}>
            <span>{t("secured_by")}</span>
          </p>
          <p className={styles.terms}>
            {t("terms_agreement", {
              terms: (
                <a
                  href={`${websiteUrl}/terms`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("terms")}
                </a>
              ),
              privacy: (
                <a
                  href={`${websiteUrl}/privacy`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("privacy")}
                </a>
              ),
            })}
          </p>
        </div>
      </div>
    </main>
  );
}
