"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { KeelMark } from "@/components/keel-mark";
import { signIn, signUp } from "@/lib/auth-client";
import { useScopedI18n } from "@/locales/client";
import { Button } from "@keel/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@keel/ui/card";
import { Field, FieldLabel } from "@keel/ui/field";
import { Input } from "@keel/ui/input";

type Mode = "sign-in" | "sign-up";

export default function LoginPage() {
  const t = useScopedI18n("auth");
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const isSignUp = mode === "sign-up";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const result = isSignUp
        ? await signUp.email({ email, password, name: email })
        : await signIn.email({ email, password });

      if (result.error) {
        setError(result.error.message ?? t("error_generic"));
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError(t("error_generic"));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <KeelMark size={28} className="text-primary mb-2" />
          <CardTitle>
            {isSignUp ? t("sign_up_title") : t("sign_in_title")}
          </CardTitle>
          <CardDescription>
            {isSignUp ? t("sign_up_subtitle") : t("sign_in_subtitle")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-5"
            onSubmit={(event) => void handleSubmit(event)}
          >
            <Field>
              <FieldLabel htmlFor="email">{t("email")}</FieldLabel>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                placeholder={t("email_placeholder")}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">{t("password")}</FieldLabel>
              <Input
                id="password"
                type="password"
                autoComplete={isSignUp ? "new-password" : "current-password"}
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>

            {error ? (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            ) : null}

            <Button type="submit" disabled={pending}>
              {pending
                ? t("loading")
                : isSignUp
                  ? t("submit_sign_up")
                  : t("submit_sign_in")}
            </Button>
          </form>

          <p className="text-muted-foreground mt-5 text-center text-sm">
            {isSignUp ? t("have_account") : t("no_account")}{" "}
            <button
              type="button"
              className="text-foreground font-medium underline underline-offset-4"
              onClick={() => {
                setError(null);
                setMode(isSignUp ? "sign-in" : "sign-up");
              }}
            >
              {isSignUp ? t("toggle_to_sign_in") : t("toggle_to_sign_up")}
            </button>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
