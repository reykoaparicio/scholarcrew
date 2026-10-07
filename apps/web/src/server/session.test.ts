import { userActor } from "@scholarcrew/domain";
import { signedInAdmin, signedInStudent, useTestDeps } from "@test/helpers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearSessionCookie, getPageActor, requirePageActor, sessionCookie } from "./session";

const jar = vi.hoisted(() => ({ value: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "sc_session" && jar.value !== undefined ? { name, value: jar.value } : undefined),
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
  notFound: () => {
    throw new Error("not_found");
  },
}));

const deps = useTestDeps();

function useCookie(cookie: string | undefined): void {
  jar.value = cookie?.split("=")[1];
}

beforeEach(() => {
  jar.value = undefined;
});

describe("session cookies", () => {
  it("sets a 30-day HttpOnly, Secure, SameSite=Lax cookie and clears it", () => {
    expect(sessionCookie("tok", 30)).toBe("sc_session=tok; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000");
    expect(clearSessionCookie()).toBe("sc_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
  });
});

describe("page actors", () => {
  it("getPageActor reads the cookie through next/headers", async () => {
    expect(await getPageActor()).toBeNull();
    useCookie("sc_session=not-a-session");
    expect(await getPageActor()).toBeNull();
    const { user, cookie } = await signedInStudent(deps().db);
    useCookie(cookie);
    expect(await getPageActor()).toEqual(userActor(user.id, "student"));
  });

  it("requirePageActor redirects signed-out visitors and hides pages from other roles", async () => {
    await expect(requirePageActor()).rejects.toThrow("redirect:/sign-in");
    const student = await signedInStudent(deps().db);
    useCookie(student.cookie);
    expect(await requirePageActor()).toEqual(userActor(student.user.id, "student"));
    await expect(requirePageActor(["admin"])).rejects.toThrow("not_found");
    const admin = await signedInAdmin(deps().db);
    useCookie(admin.cookie);
    expect(await requirePageActor(["admin"])).toEqual(userActor(admin.user.id, "admin"));
  });
});
