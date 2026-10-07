import { describe, expect, it } from "vitest";
import { MAX_TEXT_CHARS, htmlToText } from "./html";

const PAGE = [
  "<!doctype html>",
  "<html><head><title>Rotary</title><style>.x { color: red }</style>",
  '<script>var a = "<p>no</p>";</script></head>',
  "<body><!-- nav --><h1>Rotary&nbsp;Scholarship</h1>",
  "<p>Award: $2,500 &ndash; one\n   winner.</p><div>Due <b>Oct&nbsp;30</b>.<br>Apply online.</div>",
  "<noscript>Enable JS</noscript><svg><text>logo</text></svg><template><p>hidden</p></template></body></html>",
].join("\n");

describe("htmlToText", () => {
  it("bounds malformed multi-megabyte HTML in linear time", () => {
    for (const opener of ["<!--", "<script>", "<a"]) {
      const source = opener.repeat(Math.ceil(2_000_000 / opener.length));
      const started = performance.now();
      expect(htmlToText(source).length).toBeLessThan(100);
      expect(performance.now() - started).toBeLessThan(500);
    }
  });

  it("drops comments and script, style, noscript, svg, and template contents", () => {
    const text = htmlToText(PAGE);
    for (const gone of ["nav", "color", "var a", "Enable JS", "logo", "hidden", "doctype"]) {
      expect(text).not.toContain(gone);
    }
  });

  it("turns block tags into line breaks and keeps paragraph breaks", () => {
    expect(htmlToText(PAGE)).toBe(
      "Rotary\nRotary Scholarship\n\nAward: $2,500 – one winner.\n\nDue Oct 30.\nApply online.",
    );
  });

  it("decodes named and numeric entities once", () => {
    const html =
      "<p>&amp; &lt;b&gt; &quot;q&quot; &#39;s &apos;a&apos; x&nbsp;y &ndash; &mdash; &lsquo;&rsquo; &ldquo;&rdquo; &#8217; &#x2014; &amp;lt; &bogus; &#0;</p>";
    expect(htmlToText(html)).toBe(`& <b> "q" 's 'a' x y – — ‘’ “” ’ — &lt; &bogus; &#0;`);
  });

  it("joins inline tags and separates table cells", () => {
    const html =
      "<p>Sch<b>olar</b>ship</p><table><tr><td>Amount</td><td>$500</td></tr><tr><th>Due</th><td>May 1</td></tr></table>";
    expect(htmlToText(html)).toBe("Scholarship\n\nAmount $500\n\nDue May 1");
  });

  it("caps output at 200,000 characters", () => {
    expect(htmlToText(`<p>${"word ".repeat(60_000)}</p>`)).toHaveLength(MAX_TEXT_CHARS);
    expect(htmlToText("")).toBe("");
  });
});
