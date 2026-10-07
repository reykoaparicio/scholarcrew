import { describe, expect, it } from "vitest";
import {
  type FetchLike,
  type LookupLike,
  MAX_PAGE_BYTES,
  MAX_REDIRECTS,
  USER_AGENT,
  createFetchPage,
  isPrivateAddress,
  pinnedLookup,
} from "./fetch";

/** Answers with `next` (a fixed Response or one built per call) and records every call. */
function fakeFetch(
  next: Response | ((url: string) => Response),
): FetchLike & { calls: Array<{ url: string; init: RequestInit }> } {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return typeof next === "function" ? next(url) : next;
  };
  return Object.assign(impl, { calls });
}

/** Every host resolves to one public address, so no test touches DNS. */
const publicLookup: LookupLike = async () => [{ address: "93.184.216.34", family: 4 }];

const redirect = (location: string, status = 302) => new Response(null, { status, headers: { location } });

describe("createFetchPage", () => {
  it("fetches HTML with the bot user agent, manual redirects, and a timeout, and returns text", async () => {
    const html = "<html><body><h1>Maple Award</h1><p>Due Oct&nbsp;30.</p><script>track()</script></body></html>";
    const fetchImpl = fakeFetch(
      new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }),
    );

    const page = await createFetchPage(fetchImpl, publicLookup)("https://example.org/award");

    expect(page).toEqual({ status: 200, text: "Maple Award\n\nDue Oct 30.", contentType: "text/html; charset=utf-8" });
    expect(fetchImpl.calls).toHaveLength(1);
    const call = fetchImpl.calls[0];
    expect(call?.url).toBe("https://example.org/award");
    expect(call?.init.redirect).toBe("manual");
    expect(call?.init.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(call?.init.headers).get("user-agent")).toBe(USER_AGENT);
  });

  it("returns plain text as is", async () => {
    const fetchImpl = fakeFetch(new Response("Line one\n\nLine two", { headers: { "content-type": "text/plain" } }));
    expect(await createFetchPage(fetchImpl, publicLookup)("https://example.org/a.txt")).toEqual({
      status: 200,
      text: "Line one\n\nLine two",
      contentType: "text/plain",
    });
  });

  it("returns 415 for other content types", async () => {
    const fetchImpl = fakeFetch(new Response("%PDF-1.7", { headers: { "content-type": "application/pdf" } }));
    expect(await createFetchPage(fetchImpl, publicLookup)("https://example.org/a.pdf")).toEqual({
      status: 415,
      text: "",
      contentType: "application/pdf",
    });
  });

  it("passes error statuses through without a body", async () => {
    const fetchImpl = fakeFetch(
      new Response("<p>Not found</p>", { status: 404, headers: { "content-type": "text/html" } }),
    );
    expect(await createFetchPage(fetchImpl, publicLookup)("https://example.org/gone")).toEqual({
      status: 404,
      text: "",
      contentType: "text/html",
    });
  });

  it("stops reading at 2 MB", async () => {
    const big = "a".repeat(3 * 1024 * 1024);
    const fetchImpl = fakeFetch(new Response(big, { headers: { "content-type": "text/plain" } }));
    const page = await createFetchPage(fetchImpl, publicLookup)("https://example.org/big.txt");
    expect(page.text).toHaveLength(MAX_PAGE_BYTES);
  });

  it("refuses non-web and private-network URLs without fetching", async () => {
    const fetchImpl = fakeFetch(new Response("secret", { headers: { "content-type": "text/plain" } }));
    const fetchPage = createFetchPage(fetchImpl, publicLookup);
    for (const url of [
      "file:///etc/passwd",
      "http://localhost:3000/api",
      "http://169.254.169.254/latest/meta-data",
      "http://10.0.0.5/",
      "http://192.168.1.1/",
      "http://[::1]/",
    ]) {
      expect(await fetchPage(url)).toEqual({ status: 400, text: "", contentType: "" });
    }
    expect(fetchImpl.calls).toEqual([]);
  });

  it("checks every redirect hop: follows a public one and refuses one to a private host before requesting it", async () => {
    const page = new Response("Moved here", { headers: { "content-type": "text/plain" } });
    const follows = fakeFetch((url) => (url.endsWith("/old") ? redirect("/new", 301) : page));
    expect(await createFetchPage(follows, publicLookup)("https://example.org/old")).toMatchObject({
      status: 200,
      text: "Moved here",
    });
    expect(follows.calls.map((c) => c.url)).toEqual(["https://example.org/old", "https://example.org/new"]);

    const ssrf = fakeFetch(() => redirect("http://10.0.0.5/admin"));
    expect(await createFetchPage(ssrf, publicLookup)("https://example.org/award")).toEqual({
      status: 400,
      text: "",
      contentType: "",
    });
    expect(ssrf.calls).toHaveLength(1);
  });

  it("refuses host names that resolve to private addresses", async () => {
    const fetchImpl = fakeFetch(new Response("secret", { headers: { "content-type": "text/plain" } }));
    const toLoopback: LookupLike = async () => [{ address: "127.0.0.1", family: 4 }];
    const mixed: LookupLike = async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "fd00::1", family: 6 },
    ];
    expect(await createFetchPage(fetchImpl, toLoopback)("http://127.0.0.1.nip.io/")).toEqual({
      status: 400,
      text: "",
      contentType: "",
    });
    expect(await createFetchPage(fetchImpl, mixed)("https://rebind.example.org/")).toEqual({
      status: 400,
      text: "",
      contentType: "",
    });
    expect(fetchImpl.calls).toEqual([]);
    for (const ip of [
      "10.1.2.3",
      "100.64.0.1",
      "172.20.0.1",
      "224.0.0.1",
      "::1",
      "fe80::1",
      "fc00::1",
      "::ffff:192.168.0.1",
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"])
      expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it("pins the connection lookup to the validated DNS answer, even if DNS changes", async () => {
    let resolutions = 0;
    const changing: LookupLike = async () => [
      { address: ++resolutions === 1 ? "93.184.216.34" : "127.0.0.1", family: 4 },
    ];
    const fetchImpl: FetchLike = async (_url, _init, addresses) => {
      const lookupSocket = pinnedLookup("rebind.example.org", addresses ?? []);
      const connected = await new Promise<string>((resolve, reject) => {
        lookupSocket("rebind.example.org", { all: false }, (err, address) =>
          err ? reject(err) : resolve(String(address)),
        );
      });
      expect(connected).toBe("93.184.216.34");
      return new Response("public", { headers: { "content-type": "text/plain" } });
    };
    expect((await createFetchPage(fetchImpl, changing)("https://rebind.example.org/")).text).toBe("public");
    expect(resolutions).toBe(1);
  });

  it(`gives up after ${MAX_REDIRECTS} redirects`, async () => {
    const loop = fakeFetch((url) => redirect(`${url}x`));
    expect(await createFetchPage(loop, publicLookup)("https://example.org/r")).toEqual({
      status: 508,
      text: "",
      contentType: "",
    });
    expect(loop.calls).toHaveLength(MAX_REDIRECTS + 1);
  });
});
