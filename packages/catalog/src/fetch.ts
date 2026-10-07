import { lookup } from "node:dns/promises";
import { type LookupFunction, isIP } from "node:net";
import { Agent, fetch as pinnedFetch } from "undici";
import { htmlToText } from "./html";
import type { CatalogDeps } from "./types";
import { isPublicHttpUrl } from "./urls";

export const USER_AGENT = "ScholarCrewBot/1.0 (+https://scholarcrew.example/bot)";
export const MAX_PAGE_BYTES = 2 * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 10_000;
export const MAX_REDIRECTS = 5;

export type ResolvedAddress = { address: string; family: number };
export type FetchLike = (url: string, init: RequestInit, addresses?: ResolvedAddress[]) => Promise<Response>;
export type LookupLike = (host: string) => Promise<Array<{ address: string; family: number }>>;

const BLOCKED = { status: 400, text: "", contentType: "" } as const;
const TOO_MANY_REDIRECTS = { status: 508, text: "", contentType: "" } as const;

const systemLookup: LookupLike = (host) => lookup(host, { all: true });

function isPrivateV4(ip: string): boolean {
  const [a = 0, b = 0] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || b === 2)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0)
  );
}

/** Loopback, private, link-local, CGNAT, multicast, and reserved addresses, IPv4 and IPv6. Anything unparseable counts as private. */
export function isPrivateAddress(address: string): boolean {
  const ip = address.toLowerCase().replace(/^\[|\]$/g, "");
  const kind = isIP(ip);
  if (kind === 4) return isPrivateV4(ip);
  if (kind !== 6) return true;
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) return isPrivateV4(mapped[1]);
  // "::", "::1", IPv4-compatible and hex-form mapped addresses, unique local (fc00::/7), link-local (fe80::/10), multicast.
  return ip.startsWith("::") || /^(?:f[cd]|fe[89ab]|ff|2001:db8:|2001:0:|2002:)/.test(ip);
}

/** SE-06: public http(s), and every address the host resolves to is public. DNS errors throw (fetchSafely skips the listing). */
async function safeAddresses(raw: string, lookupImpl: LookupLike): Promise<ResolvedAddress[] | null> {
  if (!isPublicHttpUrl(raw)) return null;
  const parsed = new URL(raw.trim());
  if (parsed.port && parsed.port !== "80" && parsed.port !== "443") return null;
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) !== 0) return isPrivateAddress(host) ? null : [{ address: host, family: isIP(host) }];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let addresses: Awaited<ReturnType<LookupLike>>;
  try {
    addresses = await Promise.race([
      lookupImpl(host),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("DNS lookup timed out")), 1000);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
  return addresses.length > 0 && addresses.every((a) => !isPrivateAddress(a.address)) ? addresses : null;
}

/** Bind the socket lookup to the checked DNS answer; never resolve the hostname a second time. */
export function pinnedLookup(host: string, addresses: ResolvedAddress[]): LookupFunction {
  return (hostname, options, callback) => {
    const first = addresses[0];
    if (hostname !== host || !first || addresses.some((a) => isPrivateAddress(a.address))) {
      callback(new Error("Unsafe network target"), "", 0);
      return;
    }
    if (options.all) callback(null, addresses);
    else callback(null, first.address, first.family);
  };
}

async function fetchPinned(url: string, init: RequestInit, addresses: ResolvedAddress[]): Promise<Response> {
  const dispatcher = new Agent({ connect: { lookup: pinnedLookup(new URL(url).hostname, addresses) } });
  try {
    const res = await pinnedFetch(url, {
      redirect: "manual",
      signal: init.signal,
      headers: init.headers as Record<string, string>,
      dispatcher,
    });
    // Consume/cancel before closing the per-hop dispatcher. The capped body retains the connection timeout.
    const body = await readCapped(res as unknown as Response, MAX_PAGE_BYTES);
    return new Response([204, 205, 304].includes(res.status) ? null : body, {
      status: res.status,
      headers: Object.fromEntries(res.headers),
    });
  } finally {
    await dispatcher.destroy();
  }
}

/** Reads at most maxBytes of the body as UTF-8, then cancels the rest of the download. */
async function readCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let text = "";
  let bytes = 0;
  while (bytes < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = value.byteLength > maxBytes - bytes ? value.subarray(0, maxBytes - bytes) : value;
    bytes += chunk.byteLength;
    text += decoder.decode(chunk, { stream: true });
  }
  await reader.cancel();
  return text + decoder.decode();
}

/**
 * The real fetchPage: 10 s timeout for the whole chain, redirects followed by hand (at most 5) so every hop is checked
 * before it's requested, 2 MB cap, HTML converted with htmlToText, plain text as is, anything else 415. A URL that
 * isn't public http(s), or whose host resolves to a private address, gets 400 without a request (SE-06).
 */
export function createFetchPage(
  fetchImpl?: FetchLike,
  lookupImpl: LookupLike = systemLookup,
): CatalogDeps["fetchPage"] {
  return async (url) => {
    const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
    let current = url.trim();
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const addresses = await safeAddresses(current, lookupImpl);
      if (!addresses) return { ...BLOCKED };
      const res = await (fetchImpl ?? fetchPinned)(
        current,
        {
          redirect: "manual",
          signal,
          headers: { "user-agent": USER_AGENT, accept: "text/html, text/plain;q=0.9" },
        },
        addresses,
      );
      const contentType = res.headers.get("content-type") ?? "";
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        await res.body?.cancel();
        if (!location) return { status: res.status, text: "", contentType };
        try {
          current = new URL(location, current).toString();
        } catch {
          return { ...BLOCKED };
        }
        continue;
      }
      const mime = (contentType.split(";")[0] ?? "").trim().toLowerCase();
      if (res.status >= 400) {
        await res.body?.cancel();
        return { status: res.status, text: "", contentType };
      }
      if (mime !== "text/html" && mime !== "text/plain") {
        await res.body?.cancel();
        return { status: 415, text: "", contentType };
      }
      const body = await readCapped(res, MAX_PAGE_BYTES);
      return {
        status: res.status,
        text: mime === "text/html" ? htmlToText(body) : body,
        contentType,
        ...(current !== url.trim() ? { finalUrl: current } : {}),
      };
    }
    return { ...TOO_MANY_REDIRECTS };
  };
}
