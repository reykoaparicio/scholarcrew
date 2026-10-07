// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EssayEditor } from "./EssayEditor";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router, usePathname: () => "/essays/e1" }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");
const version = (v: number) => ({
  id: `00000000-0000-4000-8000-00000000000${v}`,
  essayId: "e1",
  version: v,
  body: "x",
  wordCount: 1,
  authorId: "00000000-0000-4000-8000-000000000009",
  createdAt: "2026-10-06T15:00:00.000Z",
});

describe("EssayEditor", () => {
  it("counts words live and warns near and over the limit", () => {
    render(
      <EssayEditor
        essayId="e1"
        initialBody="I have always been passionate."
        baseVersion={2}
        wordLimit={500}
        charLimit={null}
      />,
    );
    expect(screen.getByText("5 / 500 words")).toBeTruthy();
    expect(screen.getByText("Draft 2 · every word typed by you")).toBeTruthy();
    const box = screen.getByRole("textbox", { name: "Your draft" });
    fireEvent.change(box, { target: { value: words(450) } });
    expect(screen.getByText("450 / 500 words")).toBeTruthy();
    expect(screen.getByText("50 words left")).toBeTruthy();
    fireEvent.change(box, { target: { value: words(501) } });
    expect(screen.getByText("1 over")).toBeTruthy();
  });

  it("saves with the base version and moves to the new version", async () => {
    const fetchMock = vi
      .fn(async (_url: string, _init?: RequestInit) => json(version(3), 201))
      .mockResolvedValueOnce(json(version(3), 201))
      .mockResolvedValueOnce(json(version(4), 201));
    vi.stubGlobal("fetch", fetchMock);
    render(<EssayEditor essayId="e1" initialBody="First line." baseVersion={2} wordLimit={500} charLimit={null} />);
    const save = screen.getByRole("button", { name: "Save draft" });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "Your draft" }), {
      target: { value: "First line. Second line." },
    });
    fireEvent.click(save);
    await waitFor(() => expect(screen.getByText("Draft 3 saved")).toBeTruthy());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/essays/e1/versions");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      body: "First line. Second line.",
      baseVersion: 2,
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Your draft" }), {
      target: { value: "First line. Second line. Third." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(screen.getByText("Draft 4 saved")).toBeTruthy());
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({ baseVersion: 3 });
    expect(nav.router.refresh).toHaveBeenCalledTimes(2);
  });

  it("stops on a conflict and offers to reload the latest draft", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ error: { code: "conflict", message: "This essay changed since you opened it" } }, 409)),
    );
    const onReload = vi.fn();
    render(
      <EssayEditor
        essayId="e1"
        initialBody="Old"
        baseVersion={1}
        wordLimit={null}
        charLimit={null}
        onReload={onReload}
      />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Your draft" }), { target: { value: "Old and new" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("This draft changed in another tab."));
    expect((screen.getByRole("button", { name: "Save draft" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Reload the latest draft" }));
    expect(onReload).toHaveBeenCalled();
    expect((screen.getByRole("textbox", { name: "Your draft" }) as HTMLTextAreaElement).value).toBe("Old and new");
  });
});
