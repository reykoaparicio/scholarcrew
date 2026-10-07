// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { URL as NodeURL, fileURLToPath } from "node:url";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminError from "../../app/(admin)/error";
import PublicError from "../../app/(public)/error";
import HelperError from "../../app/h/[token]/error";
import VerifyHoursError from "../../app/verify-hours/[token]/error";

afterEach(cleanup);

const PAGES = [
  ["(public)/error.tsx", PublicError],
  ["(admin)/error.tsx", AdminError],
  ["h/[token]/error.tsx", HelperError],
  ["verify-hours/[token]/error.tsx", VerifyHoursError],
] as const;

const TOKEN = "hl_7f3c9a1b2d4e5f60718293a4b5c6d7e8";

function boom(): Error & { digest?: string } {
  return Object.assign(new Error(`getHelperView failed for ${TOKEN}: connect ECONNREFUSED 10.0.0.5:5432`), {
    digest: "digest-9912",
  });
}

describe("error pages", () => {
  it("show a generic message and a Try again button that calls reset", () => {
    for (const [, Page] of PAGES) {
      const reset = vi.fn();
      render(<Page error={boom()} reset={reset} />);
      expect(screen.getByText("Something went wrong on our side")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(reset).toHaveBeenCalledTimes(1);
      cleanup();
    }
  });

  it("never show the error message, digest, or token, and never read the URL", () => {
    for (const [file, Page] of PAGES) {
      const { container } = render(<Page error={boom()} reset={() => {}} />);
      for (const leak of [TOKEN, "ECONNREFUSED", "digest-9912", "getHelperView"]) {
        expect(container.innerHTML, file).not.toContain(leak);
      }
      cleanup();
      const source = readFileSync(fileURLToPath(new NodeURL(`../../app/${file}`, import.meta.url)), "utf8");
      expect(source, file).not.toMatch(/error\.(message|digest|stack)|useParams|usePathname|useSearchParams|console\./);
    }
  });
});
