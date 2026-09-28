const PEM_HEADER = "-----BEGIN";

/**
 * The PKCS#8 PEM of the application key, from either the PEM itself or its
 * base64 (how `ENABLE_BANKING_KEY_CONTENT` carries it, since a multi-line
 * value does not survive every env file). Escaped `\n` from a one-line PEM
 * are restored. Throws when neither form yields a PEM.
 */
export function decodePrivateKey(base64OrPem: string): string {
  const input = base64OrPem.trim();
  if (input.startsWith(PEM_HEADER)) return restoreNewlines(input);

  const compact = input.replace(/\s+/g, "");
  if (compact === "" || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) {
    throw new Error("The Enable Banking key is neither a PEM nor base64");
  }
  const decoded = restoreNewlines(Buffer.from(compact, "base64").toString());
  if (!decoded.startsWith(PEM_HEADER)) {
    throw new Error("The Enable Banking key's base64 does not hold a PEM");
  }
  return decoded;
}

function restoreNewlines(pem: string): string {
  return pem.replaceAll("\\n", "\n").trim();
}
