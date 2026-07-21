export function normalizeAsset(input: string): string {
  const trimmed = input.trim();

  try {
    const url = new URL(trimmed);
    url.hostname = url.hostname.toLowerCase();
    url.hash = "";

    const normalized = url.toString();
    return url.pathname === "/" && !url.search ? normalized.replace(/\/$/, "") : normalized;
  } catch {
    const wildcardPrefix = trimmed.startsWith("*.") ? "*." : "";
    const value = wildcardPrefix ? trimmed.slice(2) : trimmed;
    return `${wildcardPrefix}${value.toLowerCase().replace(/\/+$/, "")}`;
  }
}
