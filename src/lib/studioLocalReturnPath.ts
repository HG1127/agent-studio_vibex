/** Validate a return location without reading browser state or making requests.
 * The origin must be the current browser origin supplied by the caller. */
export function getStudioLocalReturnPath(value: unknown, origin: string): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") ||
      /[\\\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(value)) return "/"
  try {
    const base = new URL(origin)
    if (base.origin !== origin || !["http:", "https:"].includes(base.protocol)) return "/"
    const target = new URL(value, base)
    if (target.origin !== base.origin) return "/"
    return value
  } catch { return "/" }
}
