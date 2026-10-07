import { resolveHelperToken } from "@scholarcrew/core/helpers";
import { notify } from "@scholarcrew/core/notifications";
import {
  type HelperLink,
  type HelperLinkCreated,
  type Notification,
  type NotificationPrefs,
  systemActor,
} from "@scholarcrew/domain";
import { NO_PARAMS, params, readJson, request, signedInParent, signedInStudent, useTestDeps } from "@test/helpers";
import { describe, expect, it } from "vitest";
import { GET as getPrefs, PATCH as patchPrefs } from "../notification-prefs/route";
import { POST as markRead } from "../notifications/[id]/read/route";
import { GET as listNotifications } from "../notifications/route";
import { DELETE as revokeLink } from "./[id]/route";
import { POST as createLink, GET as listLinks } from "./route";

const deps = useTestDeps();
const LINK = { label: "Ms. Rivera", helperRole: "recommender", scope: ["deadlines", "activities"] };

const create = (cookie: string, body: unknown) =>
  createLink(request("/helper-links", { method: "POST", cookie, body }), NO_PARAMS);

describe("helper links", () => {
  it("creates a scoped read-only link and shows the URL only once (HL-01)", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const res = await create(cookie, LINK);
    expect(res.status).toBe(201);
    const created = await readJson<HelperLinkCreated>(res);
    expect(created.url.startsWith("http://localhost:3000/h/")).toBe(true);
    expect(created.link).toMatchObject({ scope: ["deadlines", "activities"], expiresAt: "2026-11-05T15:00:00.000Z" });
    const listed = await listLinks(request("/helper-links", { cookie }), NO_PARAMS);
    const text = await listed.text();
    expect((JSON.parse(text) as HelperLink[]).map((l) => l.id)).toEqual([created.link.id]);
    expect(text).not.toContain(created.url.split("/h/")[1] ?? "missing");
  });

  it("refuses private scopes, long expiry, and non-students", async () => {
    const { cookie } = await signedInStudent(deps().db);
    expect((await create(cookie, { ...LINK, scope: ["essays"] })).status).toBe(400);
    expect((await create(cookie, { ...LINK, expiresInDays: 120 })).status).toBe(400);
    const parent = await signedInParent(deps().db);
    expect((await create(parent.cookie, LINK)).status).toBe(403);
  });

  it("revoking kills the token at once (HL-04); others get 404", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const other = await signedInStudent(deps().db);
    const created = await readJson<HelperLinkCreated>(await create(cookie, LINK));
    const token = created.url.split("/h/")[1] ?? "";
    expect(await resolveHelperToken(deps(), token)).not.toBeNull();
    const id = params({ id: created.link.id });
    const path = `/helper-links/${created.link.id}`;
    expect((await revokeLink(request(path, { method: "DELETE", cookie: other.cookie }), id)).status).toBe(404);
    expect((await revokeLink(request(path, { method: "DELETE", cookie }), id)).status).toBe(204);
    expect(await resolveHelperToken(deps(), token)).toBeNull();
  });
});

describe("notifications", () => {
  it("lists notifications and marks one read", async () => {
    const { user, cookie } = await signedInStudent(deps().db);
    const other = await signedInStudent(deps().db);
    const sent = await notify(deps(), systemActor("test"), {
      userId: user.id,
      kind: "new_matches",
      title: "3 new matches",
      body: "Scout found 3 scholarships worth $4,500.",
      dedupeKey: "matches:test",
    });
    const id = sent?.id ?? "";
    const list = async (c: string) =>
      readJson<Notification[]>(await listNotifications(request("/notifications", { cookie: c }), NO_PARAMS));
    expect((await list(cookie)).map((n) => n.readAt)).toEqual([null]);
    const read = (c: string) =>
      markRead(request(`/notifications/${id}/read`, { method: "POST", cookie: c }), params({ id }));
    expect((await read(other.cookie)).status).toBe(404);
    expect((await read(cookie)).status).toBe(204);
    expect((await list(cookie)).map((n) => n.readAt)).toEqual(["2026-10-06T15:00:00.000Z"]);
  });

  it("reads and updates preferences without echoing the phone number", async () => {
    const { cookie } = await signedInStudent(deps().db);
    const prefs = await readJson<NotificationPrefs>(
      await getPrefs(request("/notification-prefs", { cookie }), NO_PARAMS),
    );
    expect(prefs).toEqual({
      digestDay: 0,
      digestHour: 16,
      emailEnabled: true,
      smsEnabled: false,
      phoneSet: false,
      quietStartHour: 21,
      quietEndHour: 7,
    });
    const patch = (body: unknown) =>
      patchPrefs(request("/notification-prefs", { method: "PATCH", cookie, body }), NO_PARAMS);
    const res = await patch({ digestHour: 9, phone: "+15125550100" });
    const text = await res.text();
    expect(JSON.parse(text)).toMatchObject({ digestHour: 9, phoneSet: true });
    expect(text).not.toContain("5125550100");
    expect((await patch({ digestHour: 24 })).status).toBe(400);
    expect((await patch({ smsEnabled: true, phone: null })).status).toBe(400);
  });
});
