/**
 * Validates if a given URL string uses an external browser protocol (http, https, mailto, tel).
 */
export function isExternalWebUrl(href: string): boolean {
  if (!href) return false;
  const lower = href.toLowerCase();
  return (
    lower.startsWith("http:") ||
    lower.startsWith("https:") ||
    lower.startsWith("mailto:") ||
    lower.startsWith("tel:")
  );
}
