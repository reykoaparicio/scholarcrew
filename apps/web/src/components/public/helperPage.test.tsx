import { createHelperLink, revokeHelperLink } from "@scholarcrew/core/helpers";
import { factories } from "@scholarcrew/db/testing";
import { userActor } from "@scholarcrew/domain";
import { useTestDeps } from "@test/helpers";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import HelperPage, { metadata } from "../../app/h/[token]/page";

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "198.51.100.4" }) }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const deps = useTestDeps();

describe("/h/[token]", () => {
  it("renders the scoped view, and a revoked or unknown link is a 404 (HL-04)", async () => {
    const { user } = await factories.student(deps().db);
    const actor = userActor(user.id, "student");
    const created = await createHelperLink(deps(), actor, {
      label: "Ms. Patel",
      helperRole: "recommender",
      scope: ["activities", "stories"],
      expiresInDays: 30,
    });
    const token = created.url.split("/h/")[1] ?? "";
    const html = renderToStaticMarkup(await HelperPage({ params: Promise.resolve({ token }) }));
    expect(html).toContain("Hi Ms. Patel.");
    expect(html).toContain("Activities");
    expect(html).toContain("Nothing shared here yet.");
    expect(html).not.toContain("College list");
    expect(metadata.robots).toEqual({ index: false, follow: false });

    await expect(HelperPage({ params: Promise.resolve({ token: "not-a-real-token" }) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    await revokeHelperLink(deps(), actor, created.link.id);
    await expect(HelperPage({ params: Promise.resolve({ token }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
