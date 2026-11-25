import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Modal } from "../modal";

describe("Modal focus management", () => {
  it("moves focus inside, traps Tab, closes on Escape, and restores the trigger", async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    const { rerender } = render(
      <>
        <button type="button">Open settings</button>
        <Modal isOpen={false} onClose={onClose} title="Settings"><button type="button">Save</button></Modal>
      </>,
    );
    const trigger = screen.getByRole("button", { name: "Open settings" });
    trigger.focus();

    rerender(
      <>
        <button type="button">Open settings</button>
        <Modal isOpen onClose={onClose} title="Settings"><button type="button">Save</button></Modal>
      </>,
    );

    await new Promise(requestAnimationFrame);
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("button", { name: "Close modal" })).toHaveFocus();

    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Save" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Close modal" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <>
        <button type="button">Open settings</button>
        <Modal isOpen={false} onClose={onClose} title="Settings"><button type="button">Save</button></Modal>
      </>,
    );
    expect(screen.getByRole("button", { name: "Open settings" })).toHaveFocus();
  });
});
