/** Dedupe key: http(s) only, lowercase host, no hash, no trailing slash. Null when it isn't a web URL. */
export function normalizeUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const path = url.pathname.replace(/\/+$/, "");
  return `${url.protocol}//${url.host.toLowerCase()}${path}${url.search}`;
}

export function isHttpUrl(raw: string): boolean {
  return normalizeUrl(raw) !== null;
}

/** Lowercase, trimmed, no leading "*." or ".", blanks dropped (CATALOG_ALLOWED_DOMAINS may be empty). */
export function cleanDomains(domains: string[]): string[] {
  return domains
    .map((d) =>
      d
        .trim()
        .toLowerCase()
        .replace(/^\*?\./, "")
        .replace(/\.$/, ""),
    )
    .filter((d) => d !== "");
}

/** True when the URL's host is one of the domains or a subdomain of one. */
export function hostAllowed(raw: string, allowedDomains: string[]): boolean {
  let host: string;
  try {
    host = new URL(raw.trim()).hostname.toLowerCase();
  } catch {
    return false;
  }
  return cleanDomains(allowedDomains).some((d) => host === d || host.endsWith(`.${d}`));
}

const PRIVATE_HOST =
  /^(?:localhost|.+\.localhost|.+\.local|.+\.internal|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|169\.254\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|\[.*\])$/i;

/** http(s) to a public host name or IPv4 address. Blocks loopback, private ranges, link-local, and IPv6 literals. */
export function isPublicHttpUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  return !PRIVATE_HOST.test(url.hostname);
}
