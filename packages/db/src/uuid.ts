/**
 * A UUID version 7 (RFC 9562): 48 bits of Unix milliseconds, then random
 * bits. Time-ordered ids keep the newest rows together in the index, which
 * matters for the banking tables (02-domain.md, section 5.1).
 */
export function uuidv7(now: number = Date.now()): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const time = BigInt(now);
  const stamped = bytes.map((byte, index) => {
    if (index < 6) {
      return Number((time >> BigInt(8 * (5 - index))) & 0xffn);
    }
    if (index === 6) return (byte & 0x0f) | 0x70;
    if (index === 8) return (byte & 0x3f) | 0x80;
    return byte;
  });
  const hex = Array.from(stamped, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
