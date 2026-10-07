export const MAX_TEXT_CHARS = 200_000;

const ENTITY = /&(#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z]{2,8});/g;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "\u2013",
  mdash: "\u2014",
  rsquo: "\u2019",
  lsquo: "\u2018",
  rdquo: "\u201d",
  ldquo: "\u201c",
};

/** One pass, so "&amp;lt;" becomes "&lt;" and not "<". Unknown or invalid entities stay as written. */
export function decodeEntities(text: string): string {
  return text.replace(ENTITY, (whole: string, body: string) => {
    if (body.startsWith("#")) {
      const hex = body[1] === "x" || body[1] === "X";
      const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      const valid = code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff);
      return valid ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body] ?? whole;
  });
}

/** Readable text from an HTML page: no scripts or markup, one line per block, blank lines between paragraphs. */
export function htmlToText(html: string): string {
  const source = html.slice(0, MAX_TEXT_CHARS * 4);
  const lower = source.toLowerCase();
  const pieces: string[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    const open = source.indexOf("<", cursor);
    if (open === -1) {
      pieces.push(source.slice(cursor).replace(/\s+/g, " "));
      break;
    }
    pieces.push(source.slice(cursor, open).replace(/\s+/g, " "));
    if (source.startsWith("<!--", open)) {
      const close = source.indexOf("-->", open + 4);
      if (close === -1) break;
      cursor = close + 3;
      continue;
    }
    const close = source.indexOf(">", open + 1);
    if (close === -1) break;
    const tag = lower.slice(open + 1, close).trim();
    const name = tag.match(/^\/?([a-z][a-z0-9]*)\b/)?.[1];
    if (!tag.startsWith("/") && name && ["script", "style", "noscript", "template", "svg", "iframe"].includes(name)) {
      const closing = lower.indexOf(`</${name}`, close + 1);
      if (closing === -1) break;
      const closingEnd = source.indexOf(">", closing + 2);
      if (closingEnd === -1) break;
      cursor = closingEnd + 1;
      continue;
    }
    if (name === "p") pieces.push("\n\n");
    else if (name && /^(?:div|li|br|h[1-6]|tr|section|article)$/.test(name)) pieces.push("\n");
    else if (name === "td" || name === "th") pieces.push(" ");
    cursor = close + 1;
  }
  const flattened = pieces.join("");
  return decodeEntities(flattened)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}
