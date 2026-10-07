// @vitest-environment jsdom
import type { DocumentMeta, ExportRecord } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataCard } from "./DataCard";
import { DocumentsCard } from "./DocumentsCard";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/settings" }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

const record = (o: Partial<ExportRecord> = {}): ExportRecord => ({
  id: "11111111-1111-4111-8111-111111111111",
  status: "queued",
  createdAt: "2026-10-06T15:00:00.000Z",
  expiresAt: null,
  downloadUrl: null,
  ...o,
});

describe("DataCard export (ME-08)", () => {
  it("requests an export and shows that it's being prepared", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(record(), 201));
    vi.stubGlobal("fetch", fetchMock);
    render(<DataCard latest={null} timeZone="America/Chicago" nowIso="2026-10-06T15:00:00.000Z" />);
    fireEvent.click(screen.getByRole("button", { name: "Request export" }));
    expect(await screen.findByText(/usually ready in about 10 minutes/)).toBeTruthy();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/account/export");
  });

  it("links a ready export as JSON and Markdown and marks an old one expired", () => {
    const ready = record({
      status: "ready",
      expiresAt: "2026-10-07T15:00:00.000Z",
      downloadUrl: "/api/v1/account/exports/x",
    });
    const { unmount } = render(
      <DataCard latest={ready} timeZone="America/Chicago" nowIso="2026-10-06T16:00:00.000Z" />,
    );
    expect(screen.getByRole("link", { name: "Download export" }).getAttribute("href")).toBe(
      "/api/v1/account/exports/x",
    );
    // R3E-11: the Markdown copy is its own download of the same export.
    expect(screen.getByRole("link", { name: "Download as Markdown" }).getAttribute("href")).toBe(
      "/api/v1/account/exports/11111111-1111-4111-8111-111111111111?format=md",
    );
    unmount();
    render(<DataCard latest={ready} timeZone="America/Chicago" nowIso="2026-10-08T16:00:00.000Z" />);
    expect(screen.getByText("Last: Oct 6 · link expired")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Download export" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Download as Markdown" })).toBeNull();
  });

  it("checks a queued export again through GET /account/exports/latest (D27)", async () => {
    const ready = record({
      status: "ready",
      expiresAt: "2026-10-07T15:00:00.000Z",
      downloadUrl: "/api/v1/account/exports/x",
    });
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(ready));
    vi.stubGlobal("fetch", fetchMock);
    render(<DataCard latest={record()} timeZone="America/Chicago" nowIso="2026-10-06T15:30:00.000Z" />);
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(await screen.findByRole("link", { name: "Download export" })).toBeTruthy();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/account/exports/latest");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("GET");
  });
});

describe("DataCard delete account (ID-05)", () => {
  it("needs DELETE typed before it deletes, then leaves", async () => {
    const onDeleted = vi.fn();
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <DataCard latest={null} timeZone="America/Chicago" nowIso="2026-10-06T15:00:00.000Z" onDeleted={onDeleted} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete my account…" }));
    const confirm = screen.getByRole("button", { name: "Delete account" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), { target: { value: "delete" } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), { target: { value: "DELETE" } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/account");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("DELETE");
  });
});

describe("DocumentsCard (ON-02)", () => {
  it("lists documents with download links and deletes them", async () => {
    const doc: DocumentMeta = {
      id: "22222222-2222-4222-8222-222222222222",
      kind: "transcript",
      filename: "transcript.pdf",
      mime: "application/pdf",
      sizeBytes: 240_000,
      parseStatus: "parsed",
      uploadedAt: "2026-09-12T15:00:00.000Z",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 204 })),
    );
    render(<DocumentsCard documents={[doc]} timeZone="America/Chicago" />);
    expect(screen.getByRole("link", { name: "Download transcript.pdf" }).getAttribute("href")).toBe(
      "/api/v1/documents/22222222-2222-4222-8222-222222222222/download",
    );
    expect(screen.getByText("Transcript · 234 KB · Sep 12")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete transcript.pdf" }));
    await waitFor(() => expect(screen.queryByText("transcript.pdf")).toBeNull());
  });
});
