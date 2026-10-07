// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminFrame, adminActiveKey } from "./AdminFrame";

const nav = vi.hoisted(() => ({
  pathname: "/admin/tasks",
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
}));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname, useRouter: () => nav.router }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("adminActiveKey", () => {
  it("maps admin paths to nav keys", () => {
    expect(adminActiveKey("/admin/tasks")).toBe("tasks");
    expect(adminActiveKey("/admin/scholarships/new")).toBe("scholarships");
    expect(adminActiveKey("/admin/audit")).toBe("audit");
    expect(adminActiveKey("/admin/aid")).toBe("aid");
    expect(adminActiveKey("/admin")).toBe("tasks");
  });
});

describe("AdminFrame", () => {
  it("shows the admin nav with counts, marks the current page, and signs out", async () => {
    nav.pathname = "/admin/scholarships/abc";
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AdminFrame user={{ name: "Sam K.", email: "sam@example.test" }} counts={{ tasks: 12, reports: 3 }}>
        <p>page</p>
      </AdminFrame>,
    );
    const menu = screen.getByRole("navigation", { name: "Admin" });
    const links = within(menu).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/admin/tasks",
      "/admin/scholarships",
      "/admin/reports",
      "/admin/colleges",
      "/admin/aid",
      "/admin/audit",
    ]);
    expect(
      within(menu)
        .getByRole("link", { name: /Scholarships/ })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(within(menu).getByRole("link", { name: /Review queue/ }).textContent).toContain("12");
    expect(within(menu).getByRole("link", { name: /Reports/ }).textContent).toContain("3");
    expect(screen.getByText("Sam K.")).toBeTruthy();
    expect(screen.getByRole("main").textContent).toBe("page");
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(nav.router.replace).toHaveBeenCalledWith("/sign-in"));
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/sign-out", expect.objectContaining({ method: "POST" }));
  });

  it("stays and shows the message when sign-out fails, and leaves on unauthenticated (R3A-13)", async () => {
    const body = (code: string, message: string) => JSON.stringify({ error: { code, message } });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(body("internal", "Something went wrong"), { status: 500 }))
      .mockResolvedValueOnce(new Response(body("unauthenticated", "Sign in to continue"), { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AdminFrame user={{ name: "Sam K.", email: "sam@example.test" }} counts={{ tasks: 0, reports: 0 }}>
        <p>page</p>
      </AdminFrame>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Something went wrong");
    expect(nav.router.replace).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Sign out" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(nav.router.replace).toHaveBeenCalledWith("/sign-in"));
  });
});
