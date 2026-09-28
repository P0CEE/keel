const SESSION_PREFIX = "fake-session";
const ACCOUNT_PREFIX = "fake-account";

// Refs carry the scenario, the account and the consent they came from. The
// API and the worker each build their own provider, so the worker must be
// able to read an account the API's instance consented to, with no shared
// memory: only revocations live in memory, per instance.
export type SessionParts = {
  readonly code: string;
  readonly issuedAt: number;
  readonly serial: number;
};

export function sessionRefOf(parts: SessionParts): string {
  return [
    SESSION_PREFIX,
    encodeURIComponent(parts.code),
    parts.issuedAt,
    parts.serial,
  ].join(":");
}

export function accountRefOf(session: SessionParts, key: string): string {
  return [
    ACCOUNT_PREFIX,
    encodeURIComponent(session.code),
    encodeURIComponent(key),
    session.issuedAt,
    session.serial,
  ].join(":");
}

export function parseSessionRef(ref: string): SessionParts | null {
  const [prefix, code, issuedAt, serial, ...rest] = ref.split(":");
  if (prefix !== SESSION_PREFIX || rest.length > 0) return null;
  return toParts(code, issuedAt, serial);
}

export function parseAccountRef(
  ref: string,
): { readonly session: SessionParts; readonly key: string } | null {
  const [prefix, code, key, issuedAt, serial, ...rest] = ref.split(":");
  if (prefix !== ACCOUNT_PREFIX || key === undefined || rest.length > 0) {
    return null;
  }
  const session = toParts(code, issuedAt, serial);
  return session === null ? null : { session, key: decodeURIComponent(key) };
}

function toParts(
  code: string | undefined,
  issuedAt: string | undefined,
  serial: string | undefined,
): SessionParts | null {
  if (code === undefined || !/^\d+$/.test(issuedAt ?? "")) return null;
  if (!/^\d+$/.test(serial ?? "")) return null;
  return {
    code: decodeURIComponent(code),
    issuedAt: Number(issuedAt),
    serial: Number(serial),
  };
}
