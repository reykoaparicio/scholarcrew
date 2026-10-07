import { blobs, documents } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { MAX_UPLOAD_BYTES } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { SYSTEM, actorOf } from "../../test/helpers";
import { createTestDeps, fixedClock } from "../shared";
import {
  deleteDocument,
  getBlob,
  getDocument,
  listDocuments,
  putBlob,
  readDocumentBytes,
  uploadDocument,
} from "./index";

const pdf = Buffer.from("%PDF-1.7 transcript for Maya Rivera");
const upload = { kind: "transcript" as const, filename: "transcript.pdf", mime: "application/pdf", bytes: pdf };

describe("documents", () => {
  it("encrypts uploads at rest and reads them back for the owner and system", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const meta = await uploadDocument(deps, actorOf(user), upload);
    expect(meta).toMatchObject({
      kind: "transcript",
      filename: "transcript.pdf",
      mime: "application/pdf",
      sizeBytes: pdf.length,
      parseStatus: "none",
      uploadedAt: "2026-10-06T15:00:00.000Z",
    });
    const [blob] = await deps.db.select().from(blobs);
    expect(blob?.ciphertext.includes(Buffer.from("Maya Rivera"))).toBe(false);
    expect((await readDocumentBytes(deps, actorOf(user), meta.id)).bytes.equals(pdf)).toBe(true);
    expect((await readDocumentBytes(deps, SYSTEM, meta.id)).bytes.equals(pdf)).toBe(true);
    expect(await getDocument(deps, actorOf(user), meta.id)).toEqual(meta);
  });

  it("hides documents from other users, parents, and admins", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const { user: other } = await factories.student(deps.db);
    const parent = await factories.parent(deps.db);
    await factories.family(deps.db, { studentIds: [user.id], parentIds: [parent.id] });
    const admin = await factories.admin(deps.db);
    const meta = await uploadDocument(deps, actorOf(user), upload);
    for (const actor of [actorOf(other), actorOf(parent), actorOf(admin)]) {
      await expect(getDocument(deps, actor, meta.id)).rejects.toMatchObject({ code: "not_found" });
      await expect(readDocumentBytes(deps, actor, meta.id)).rejects.toMatchObject({ code: "not_found" });
    }
  });

  it("rejects unsupported types, empty files, and files over 10 MB", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const me = actorOf(user);
    await expect(uploadDocument(deps, me, { ...upload, mime: "application/zip" })).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(uploadDocument(deps, me, { ...upload, bytes: Buffer.alloc(0) })).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(
      uploadDocument(deps, me, { ...upload, bytes: Buffer.alloc(MAX_UPLOAD_BYTES + 1) }),
    ).rejects.toMatchObject({
      code: "invalid_input",
    });
    expect(await deps.db.select().from(documents)).toHaveLength(0);
    expect(await deps.db.select().from(blobs)).toHaveLength(0);
  });

  it("lists only the actor's own documents, newest first", async () => {
    const clock = fixedClock("2026-10-06T15:00:00.000Z");
    const deps = createTestDeps({ clock });
    const { user } = await factories.student(deps.db);
    const { user: other } = await factories.student(deps.db);
    const parent = await factories.parent(deps.db);
    await factories.family(deps.db, { studentIds: [user.id], parentIds: [parent.id] });
    const first = await uploadDocument(deps, actorOf(user), upload);
    clock.set("2026-10-07T15:00:00.000Z");
    const second = await uploadDocument(deps, actorOf(user), {
      ...upload,
      kind: "award_letter",
      filename: "letter.pdf",
    });
    await uploadDocument(deps, actorOf(other), upload);
    expect((await listDocuments(deps, actorOf(user))).map((d) => d.id)).toEqual([second.id, first.id]);
    expect(await listDocuments(deps, actorOf(parent))).toEqual([]);
    await expect(listDocuments(deps, SYSTEM)).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("strips paths from file names", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const text = { kind: "essay" as const, mime: "text/plain", bytes: Buffer.from("My story") };
    expect((await uploadDocument(deps, actorOf(user), { ...text, filename: "../../etc/passwd.txt" })).filename).toBe(
      "passwd.txt",
    );
    expect((await uploadDocument(deps, actorOf(user), { ...text, filename: "  " })).filename).toBe("upload");
  });

  it("deletes the document and its blob for the owner only", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const { user: other } = await factories.student(deps.db);
    const meta = await uploadDocument(deps, actorOf(user), upload);
    await expect(deleteDocument(deps, actorOf(other), meta.id)).rejects.toMatchObject({ code: "not_found" });
    await deleteDocument(deps, actorOf(user), meta.id);
    await expect(getDocument(deps, actorOf(user), meta.id)).rejects.toMatchObject({ code: "not_found" });
    expect(await deps.db.select().from(blobs)).toHaveLength(0);
  });

  it("round-trips blobs", async () => {
    const deps = createTestDeps();
    const id = await putBlob(deps, Buffer.from("export bytes"));
    expect((await getBlob(deps, id)).toString("utf8")).toBe("export bytes");
    await expect(getBlob(deps, "6f1c2a0e-9b7d-4c1e-8f00-1a2b3c4d5e6f")).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("declared MIME verification", () => {
  it("refuses HTML as PNG and PDF as text", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await expect(
      uploadDocument(deps, actorOf(user), { ...upload, mime: "image/png", bytes: Buffer.from("<html>evil</html>") }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(uploadDocument(deps, actorOf(user), { ...upload, mime: "text/plain" })).rejects.toMatchObject({
      code: "invalid_input",
    });
  });
});
