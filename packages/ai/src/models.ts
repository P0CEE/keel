// The models, by role (04-ai-study.md, section 4.1): Vercel AI Gateway ids,
// each overridable by an environment variable, so changing a model is a
// configuration change, never a code one. Replay the eval before any change.

export const MODEL_ROLES = {
  categorize: {
    env: "AI_MODEL_CATEGORIZE",
    default: "openai/gpt-6-luna",
  },
  // Another provider, which the Gateway switches to on its own when the
  // first fails.
  categorizeFallback: {
    env: "AI_MODEL_CATEGORIZE_FALLBACK",
    default: "google/gemini-3.1-flash-lite",
  },
} as const;

export type ModelRole = keyof typeof MODEL_ROLES;

/** The Gateway id a role runs on in this process. */
export function modelFor(
  role: ModelRole,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const { env: name, default: fallback } = MODEL_ROLES[role];
  const configured = env[name]?.trim() ?? "";
  return configured === "" ? fallback : configured;
}
