import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TextInput } from "../TextInput/TextInput";
import { Modal } from "./Modal";

describe("Modal", () => {
  it("renders nothing when closed", () => {
    render(
      <Modal open={false} title="Add a story" onClose={vi.fn()}>
        Body
      </Modal>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("is a labelled modal dialog element", () => {
    render(
      <Modal open title="Add a story" onClose={vi.fn()}>
        Body
      </Modal>,
    );
    const dialog = screen.getByRole("dialog", { name: "Add a story" });
    expect(dialog.tagName).toBe("DIALOG");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("closes on Escape only", () => {
    const onClose = vi.fn();
    render(
      <Modal open title="Add a story" onClose={onClose}>
        Body
      </Modal>,
    );
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("focuses the first focusable element in its content", () => {
    render(
      <Modal open title="Add a story" onClose={vi.fn()}>
        <TextInput label="Title" />
        <TextInput label="Themes" />
      </Modal>,
    );
    expect(document.activeElement).toBe(screen.getByLabelText("Title"));
  });

  it("falls back to the close button, which closes", () => {
    const onClose = vi.fn();
    render(
      <Modal open title="Heads up" onClose={onClose}>
        <p>Nothing to fill in.</p>
      </Modal>,
    );
    const close = screen.getByRole("button", { name: "Close" });
    expect(document.activeElement).toBe(close);
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("returns focus to where it was when closed", () => {
    const ui = (open: boolean) => (
      <>
        <button type="button">Open</button>
        <Modal open={open} title="T" onClose={vi.fn()}>
          <TextInput label="Name" />
        </Modal>
      </>
    );
    const { rerender } = render(ui(false));
    const opener = screen.getByRole("button", { name: "Open" });
    opener.focus();
    rerender(ui(true));
    expect(document.activeElement).toBe(screen.getByLabelText("Name"));
    rerender(ui(false));
    expect(document.activeElement).toBe(opener);
  });

  it("Tab from the last control wraps to the close button", () => {
    render(
      <Modal open title="Add a story" onClose={vi.fn()} footer={<button type="button">Save</button>}>
        <TextInput label="Title" />
      </Modal>,
    );
    const save = screen.getByRole("button", { name: "Save" });
    save.focus();
    fireEvent.keyDown(save, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
  });

  it("Shift+Tab from the close button wraps to the last control", () => {
    const onClose = vi.fn();
    render(
      <>
        <Modal open title="Other" onClose={onClose}>
          <p>Behind.</p>
        </Modal>
        <Modal open title="Add a story" onClose={vi.fn()} footer={<button type="button">Save</button>}>
          <TextInput label="Title" />
        </Modal>
      </>,
    );
    const story = screen.getByRole("dialog", { name: "Add a story" });
    const close = within(story).getByRole("button", { name: "Close" });
    close.focus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(within(story).getByRole("button", { name: "Save" }));
    // Escape only closes the dialog that holds focus
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});
