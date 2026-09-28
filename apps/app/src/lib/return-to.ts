/**
 * Where to land after signing in: only a path of this app. "//evil.com" and
 * "/\evil.com" (browsers read a backslash as a slash) would leave the site,
 * so anything that is not a plain relative path goes home instead.
 */
export function safeReturnTo(raw: string | null | undefined): string {
  if (raw == null || !raw.startsWith("/") || /^\/[/\\]/.test(raw)) {
    return "/";
  }
  return raw;
}
