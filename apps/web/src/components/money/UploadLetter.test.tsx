// @vitest-environment jsdom
import { MAX_UPLOAD_BYTES } from "@scholarcrew/domain";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppealButton } from "./AppealButton";
import { RemoveOfferButton, UploadLetter } from "./UploadLetter";
import { STATE_U, offer } from "./fixtures";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router, usePathname: () => "/money/offers" }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
const DOC = {
  id: "33333333-0000-4000-8000-000000000001",
  kind: "award_letter",
  filename: "stateu.pdf",
  mime: "application/pdf",
  sizeBytes: 2048,
  parseStatus: "none",
  uploadedAt: "2027-03-01T15:00:00.000Z",
};
const pdf = () => new File(["%PDF-1.7"], "stateu.pdf", { type: "application/pdf" });

function pick(file: File) {
  fireEvent.change(screen.getByLabelText("Award letter file"), { target: { files: [file] } });
}

describe("UploadLetter", () => {
  it("takes only a PDF under 10 MB, checked before anything is sent (R2P-8)", () => {
    const fetchMock = vi.fn(async () => json({}));
    vi.stubGlobal("fetch", fetchMock);
    render(<UploadLetter colleges={[{ id: "100", name: "State U" }]} awardYear="2027-28" pollMs={1} />);
    expect(screen.getByLabelText("Award letter file").getAttribute("accept")).toBe("application/pdf");
    expect(screen.getByText("Upload the award letter as a PDF (up to 10 MB).")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Upload letter" }));
    expect(screen.getByRole("alert").textContent).toBe("Pick the award letter file.");
    pick(new File(["png"], "letter.png", { type: "image/png" }));
    fireEvent.click(screen.getByRole("button", { name: "Upload letter" }));
    expect(screen.getByRole("alert").textContent).toBe("Upload the award letter as a PDF. Aid can only read PDFs.");
    pick(new File(["x"], "letter.docx", { type: "application/msword" }));
    fireEvent.click(screen.getByRole("button", { name: "Upload letter" }));
    expect(screen.getByRole("alert").textContent).toBe("Upload the award letter as a PDF. Aid can only read PDFs.");
    const big = pdf();
    Object.defineProperty(big, "size", { value: MAX_UPLOAD_BYTES + 1 });
    pick(big);
    fireEvent.click(screen.getByRole("button", { name: "Upload letter" }));
    expect(screen.getByRole("alert").textContent).toBe(
      "This file is over 10 MB. Save just the award pages as a PDF and try again.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uploads, creates the offer, waits for the parse, and links to the review", async () => {
    const replies = [
      json(DOC, 201),
      json(offer({ status: "parsing", lines: [] }), 201),
      json(offer({ status: "parsing", lines: [] })),
      json(offer({ status: "needs_review" })),
    ];
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => replies.shift() ?? json({}));
    vi.stubGlobal("fetch", fetchMock);
    render(<UploadLetter colleges={[{ id: "100", name: "State U" }]} awardYear="2027-28" pollMs={1} />);
    pick(pdf());
    fireEvent.click(screen.getByRole("button", { name: "Upload letter" }));
    await waitFor(() => expect(screen.getByText("Aid is reading your letter…")).toBeTruthy());
    await waitFor(() => expect(screen.getByRole("link", { name: "Review the lines" })).toBeTruthy());
    expect(screen.getByRole("link", { name: "Review the lines" }).getAttribute("href")).toBe(
      `/money/offers/${STATE_U}`,
    );
    const calls = fetchMock.mock.calls;
    expect(calls.map((c) => [c[0], c[1]?.method])).toEqual([
      ["/api/v1/documents", "POST"],
      ["/api/v1/offers", "POST"],
      [`/api/v1/offers/${STATE_U}`, "GET"],
      [`/api/v1/offers/${STATE_U}`, "GET"],
    ]);
    const form = calls[0]?.[1]?.body as FormData;
    expect(form.get("kind")).toBe("award_letter");
    expect((form.get("file") as File).name).toBe("stateu.pdf");
    expect(JSON.parse(String(calls[1]?.[1]?.body))).toEqual({
      collegeId: "100",
      documentId: DOC.id,
      awardYear: "2027-28",
    });
    expect(nav.router.refresh).toHaveBeenCalled();
  });

  it("follows the parse job over SSE when the offer has a parseJobId (D31)", async () => {
    const JOB = "44444444-0000-4000-8000-000000000001";
    const sources: Array<{ url: string; emit: (type: string, data?: string) => void }> = [];
    class FakeEventSource {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSED = 2;
      readyState = 1;
      url: string;
      listeners = new Map<string, Array<(e: MessageEvent<string>) => void>>();
      constructor(url: string) {
        this.url = url;
        sources.push({ url, emit: (type, data = "{}") => this.emit(type, data) });
      }
      addEventListener(type: string, fn: (e: MessageEvent<string>) => void) {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
      }
      emit(type: string, data: string) {
        for (const fn of this.listeners.get(type) ?? []) fn(new MessageEvent(type, { data }));
      }
      close() {
        this.readyState = 2;
      }
    }
    vi.stubGlobal("EventSource", FakeEventSource);
    const replies = [
      json(DOC, 201),
      json(offer({ status: "parsing", lines: [], parseJobId: JOB }), 201),
      json(offer({ status: "needs_review" })),
    ];
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => replies.shift() ?? json({}));
    vi.stubGlobal("fetch", fetchMock);
    render(<UploadLetter colleges={[{ id: "100", name: "State U" }]} awardYear="2027-28" pollMs={1} />);
    pick(pdf());
    fireEvent.click(screen.getByRole("button", { name: "Upload letter" }));
    await waitFor(() => expect(sources).toHaveLength(1));
    expect(sources[0]?.url).toBe(`/api/v1/jobs/${JOB}/events`);
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const done = {
      id: JOB,
      kind: "offer_parse",
      status: "ready",
      conversationId: null,
      requestMessageId: null,
      resultMessageId: null,
      refId: STATE_U,
      progress: [],
      error: null,
      safety: null,
      createdAt: "2027-03-01T15:00:00.000Z",
      updatedAt: "2027-03-01T15:00:05.000Z",
    };
    act(() => sources[0]?.emit("job", JSON.stringify(done)));
    await waitFor(() => expect(screen.getByRole("link", { name: "Review the lines" })).toBeTruthy());
    expect(fetchMock.mock.calls.map((c) => [c[0], c[1]?.method])).toEqual([
      ["/api/v1/documents", "POST"],
      ["/api/v1/offers", "POST"],
      [`/api/v1/offers/${STATE_U}`, "GET"],
    ]);
    expect(nav.router.refresh).toHaveBeenCalled();
  });

  it("explains a letter Aid couldn't read, then removes it so the student can try again (R2P-8)", async () => {
    const replies = [
      json(DOC, 201),
      json(offer({ status: "parsing", lines: [] }), 201),
      json(offer({ status: "failed", lines: [] })),
      new Response(null, { status: 204 }),
    ];
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => replies.shift() ?? json({}));
    vi.stubGlobal("fetch", fetchMock);
    render(<UploadLetter colleges={[{ id: "100", name: "State U" }]} awardYear="2027-28" pollMs={1} />);
    pick(pdf());
    fireEvent.click(screen.getByRole("button", { name: "Upload letter" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "Aid couldn't read this letter. Upload a clearer PDF, or compare it by hand in the offer tool.",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove and try again" }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe(`/api/v1/offers/${STATE_U}`);
    expect(fetchMock.mock.calls.at(-1)?.[1]?.method).toBe("DELETE");
    expect(screen.queryByRole("alert")).toBeNull();
    expect((screen.getByRole("button", { name: "Upload letter" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("RemoveOfferButton (R2P-8)", () => {
  it("deletes a failed or unconfirmed letter, then refreshes, and shows the server's message on a conflict", async () => {
    const replies = [
      new Response(null, { status: 204 }),
      json({ error: { code: "conflict", message: "Confirmed offers stay. Start a new season to archive them." } }, 409),
    ];
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => replies.shift() ?? json({}));
    vi.stubGlobal("fetch", fetchMock);
    render(<RemoveOfferButton offerId={STATE_U} collegeName="State U" />);
    fireEvent.click(screen.getByRole("button", { name: "Remove the State U letter" }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/v1/offers/${STATE_U}`);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("DELETE");
    fireEvent.click(screen.getByRole("button", { name: "Remove the State U letter" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Confirmed offers stay. Start a new season to archive them."),
    );
    expect(nav.router.refresh).toHaveBeenCalledTimes(1);
  });
});

describe("AppealButton (MO-08)", () => {
  it("shows the allowance message with a See plans link on 402 and starts no job (CR-10, E-16-6)", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      json(
        {
          error: {
            code: "limit_reached",
            message:
              "You've used all 20 crew requests this month. Manual tools still work, and the count resets Oct 31, 2026, 7:00 PM CDT.",
          },
        },
        402,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<AppealButton offerId={STATE_U} collegeName="State U" timeZone="America/Chicago" />);
    fireEvent.click(screen.getByRole("button", { name: "Draft an appeal outline for State U" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "You've used all 20 crew requests this month. Manual tools still work, and the count resets Oct 31, 2026, 7:00 PM CDT.",
    );
    expect(screen.getByRole("link", { name: "See plans" }).getAttribute("href")).toBe("/settings");
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([`/api/v1/offers/${STATE_U}/appeal`]);
  });
});
