// The text field's words, kept pure: which message shows under the field,
// and how its label reads.

/** The browser's own checks a field can fail, in the order their messages are preferred. */
export type Check =
  | "valueMissing"
  | "typeMismatch"
  | "tooShort"
  | "tooLong"
  | "patternMismatch";

export const CHECKS: readonly Check[] = [
  "valueMissing",
  "typeMismatch",
  "tooShort",
  "tooLong",
  "patternMismatch",
];

/** The words for each failed browser check. */
export type Messages = Readonly<Partial<Record<Check, string>>>;

export type Validity = Readonly<Record<Check, boolean>> & {
  readonly valid: boolean | null;
};

/**
 * The error under the field, or "" when there is none: an error from
 * outside (a server's answer) whatever the value; else, once the field is
 * invalid, the words for the first failed check, or Base UI's reason (the
 * browser's message, or the `validate` rule's).
 */
export function problemOf({
  error,
  validity,
  messages,
  reason,
}: {
  readonly error?: string;
  readonly validity: Validity;
  readonly messages?: Messages;
  readonly reason: string;
}): string {
  if (error !== undefined && error !== "") return error;
  if (validity.valid !== false) return "";
  const failed = CHECKS.find((check) => validity[check]);
  const words = failed === undefined ? undefined : messages?.[failed];
  return words !== undefined && words !== "" ? words : reason;
}

/**
 * The label as shown: `required={false}` marks it optional ("Referral code
 * (optional)"); required fields, and fields that say nothing, carry no mark.
 */
export function labelText(
  label: string,
  required: boolean | undefined,
  optionalMark: string | undefined,
): string {
  return required === false && optionalMark !== undefined && optionalMark !== ""
    ? `${label} ${optionalMark}`
    : label;
}
