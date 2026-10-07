import { setDepsForTests } from "@/server/deps";
import { fixedClock } from "@scholarcrew/core/shared";
import { documents } from "@scholarcrew/db";
import { type DocumentMeta, MAX_UPLOAD_BYTES } from "@scholarcrew/domain";
import {
  NO_PARAMS,
  chunkedRequest,
  errorOf,
  params,
  readJson,
  request,
  signedInStudent,
  useTestDeps,
} from "@test/helpers";
import { describe, expect, it } from "vitest";
import { GET as download } from "./[id]/download/route";
import { DELETE as deleteDocument, GET as getDocument } from "./[id]/route";
import { GET as listDocuments, POST as upload } from "./route";

const deps = useTestDeps();

function form(kind: string | null, file: File | null): FormData {
  const data = new FormData();
  if (kind !== null) data.set("kind", kind);
  if (file) data.set("file", file);
  return data;
}

const send = (cookie: string, body: FormData | string) =>
  upload(request("/documents", { method: "POST", cookie, body }), NO_PARAMS);

describe("documents", () => {
  it("rejects declared PDF and image types that disagree with the content", async () => {
    const { cookie } = await signedInStudent(deps().db);
    expect(
      (await send(cookie, form("other", new File(["plain text"], "fake.pdf", { type: "application/pdf" })))).status,
    ).toBe(400);
    expect(
      (await send(cookie, form("other", new File(["plain text"], "fake.png", { type: "image/png" })))).status,
    ).toBe(400);
    expect(await deps().db.select().from(documents)).toEqual([]);
  });

  it("uploads, reads, downloads, and deletes a document", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const res = await send(
      cookie,
      form("transcript", new File(["Maya transcript"], "transcript.txt", { type: "text/plain" })),
    );
    expect(res.status).toBe(201);
    const meta = await readJson<DocumentMeta>(res);
    expect(meta).toMatchObject({
      kind: "transcript",
      filename: "transcript.txt",
      mime: "text/plain",
      sizeBytes: 15,
      parseStatus: "none",
    });
    const id = params({ id: meta.id });

    expect((await readJson<DocumentMeta>(await getDocument(request(`/documents/${meta.id}`, { cookie }), id))).id).toBe(
      meta.id,
    );

    const file = await download(request(`/documents/${meta.id}/download`, { cookie }), id);
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("text/plain");
    expect(file.headers.get("content-disposition")).toBe(
      "attachment; filename=\"transcript.txt\"; filename*=UTF-8''transcript.txt",
    );
    expect(file.headers.get("cache-control")).toBe("no-store");
    expect(await file.text()).toBe("Maya transcript");

    expect((await deleteDocument(request(`/documents/${meta.id}`, { method: "DELETE", cookie }), id)).status).toBe(204);
    expect((await getDocument(request(`/documents/${meta.id}`, { cookie }), id)).status).toBe(404);
  });

  it("keeps binary files byte for byte", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0xff, 0x10, 0x80]);
    const meta = await readJson<DocumentMeta>(
      await send(cookie, form("award_letter", new File([bytes], "aid.pdf", { type: "application/pdf" }))),
    );
    const file = await download(request(`/documents/${meta.id}/download`, { cookie }), params({ id: meta.id }));
    expect(file.headers.get("content-type")).toBe("application/pdf");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes);
  });

  it("rejects files over 10 MB with 413, from Content-Length before reading and from the file size", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const big = new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], "big.pdf", { type: "application/pdf" });
    const res = await send(cookie, form("other", big));
    expect(res.status).toBe(413);
    expect((await errorOf(res)).message).toBe("Files can be up to 10 MB");
    const small = form("other", new File(["x"], "a.txt", { type: "text/plain" }));
    const declared = await upload(
      request("/documents", {
        method: "POST",
        cookie,
        body: small,
        headers: { "content-length": String(MAX_UPLOAD_BYTES + 70_000) },
      }),
      NO_PARAMS,
    );
    expect(declared.status).toBe(413);
    expect(await deps().db.select().from(documents)).toEqual([]);
  });

  it("stops reading a chunked upload with no Content-Length once it passes the cap", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const { req, pulled } = chunkedRequest("/documents", {
      cookie,
      chunk: new Uint8Array(1024 * 1024),
      count: 20,
      headers: { "content-type": "multipart/form-data; boundary=scholarcrew" },
    });
    const res = await upload(req, NO_PARAMS);
    expect(res.status).toBe(413);
    expect((await errorOf(res)).message).toBe("Files can be up to 10 MB");
    expect(pulled()).toBeLessThan(20);
    expect(await deps().db.select().from(documents)).toEqual([]);
  });

  it("lists only the caller's own documents, newest first (D27)", async () => {
    const owner = await signedInStudent(deps().db);
    const other = await signedInStudent(deps().db);
    const txt = (name: string) => new File([name], name, { type: "text/plain" });
    const older = await readJson<DocumentMeta>(await send(owner.cookie, form("transcript", txt("old.txt"))));
    setDepsForTests({ ...deps(), clock: fixedClock("2026-10-06T16:00:00.000Z") });
    const newer = await readJson<DocumentMeta>(await send(owner.cookie, form("resume", txt("new.txt"))));
    await send(other.cookie, form("other", txt("theirs.txt")));
    const list = await readJson<DocumentMeta[]>(
      await listDocuments(request("/documents", { cookie: owner.cookie }), NO_PARAMS),
    );
    expect(list.map((d) => d.id)).toEqual([newer.id, older.id]);
    expect((await listDocuments(request("/documents"), NO_PARAMS)).status).toBe(401);
  });

  it("rejects missing files, unknown kinds, unsupported types, and non-multipart bodies", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const txt = () => new File(["x"], "a.txt", { type: "text/plain" });
    expect((await send(cookie, form("transcript", null))).status).toBe(400);
    expect((await send(cookie, form(null, txt()))).status).toBe(400);
    expect((await send(cookie, form("selfie", txt()))).status).toBe(400);
    expect((await send(cookie, form("other", new File(["PK"], "a.zip", { type: "application/zip" })))).status).toBe(
      400,
    );
    expect((await send(cookie, JSON.stringify({ kind: "other" }))).status).toBe(400);
  });

  it("is owner-only: other users get 404", async () => {
    const owner = await signedInStudent(deps().db);
    const other = await signedInStudent(deps().db);
    const meta = await readJson<DocumentMeta>(
      await send(owner.cookie, form("resume", new File(["cv"], "cv.txt", { type: "text/plain" }))),
    );
    const id = params({ id: meta.id });
    expect((await getDocument(request(`/documents/${meta.id}`, { cookie: other.cookie }), id)).status).toBe(404);
    expect((await download(request(`/documents/${meta.id}/download`, { cookie: other.cookie }), id)).status).toBe(404);
    const del = request(`/documents/${meta.id}`, { method: "DELETE", cookie: other.cookie });
    expect((await deleteDocument(del, id)).status).toBe(404);
  });

  it("limits uploads to 20 an hour per user (SE-04)", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const statuses: number[] = [];
    for (let i = 0; i < 21; i += 1) {
      const res = await send(cookie, form("other", new File([`note ${i}`], `n${i}.txt`, { type: "text/plain" })));
      statuses.push(res.status);
    }
    expect(statuses.filter((s) => s === 201)).toHaveLength(20);
    expect(statuses[20]).toBe(429);
  });
});
