/** A Redis stream entry id, `<milliseconds>-<sequence>`, split for comparison. */
function parts(id: string): readonly [bigint, bigint] {
  const match = /^(\d+)-(\d+)$/.exec(id);
  if (!match) {
    throw new Error(`Not a stream id: ${id}`);
  }
  return [BigInt(match[1] ?? "0"), BigInt(match[2] ?? "0")];
}

/** Order two stream ids: negative, zero or positive, like a sort comparator. */
export function compareIds(a: string, b: string): number {
  const [aMs, aSeq] = parts(a);
  const [bMs, bSeq] = parts(b);
  if (aMs !== bMs) {
    return aMs < bMs ? -1 : 1;
  }
  if (aSeq !== bSeq) {
    return aSeq < bSeq ? -1 : 1;
  }
  return 0;
}

export function isStreamId(id: string): boolean {
  return /^\d+-\d+$/.test(id);
}

export function maxId(a: string, b: string): string {
  return compareIds(a, b) >= 0 ? a : b;
}
