"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/app/components/ui/modal";
import { Button } from "@/app/components/ui/button";

export const ShortcutsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const router = useRouter();
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [helpOpen, setHelpOpen] = useState(false);
  const [gPending, setGPending] = useState(false);

  useEffect(() => {
    let gTimer: number | undefined;

    const resetG = () => {
      setGPending(false);
      if (gTimer) window.clearTimeout(gTimer);
      gTimer = undefined;
    };

    const isEditable = (el: Element | null) => {
      if (!el) return false;
      const tag = (el as HTMLElement).tagName;
      const editable = (el as HTMLElement).isContentEditable;
      return (
        editable ||
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT"
      );
    };

    const getItems = () =>
      Array.from(
        document.querySelectorAll<HTMLElement>("[data-shortcut-confession]"),
      );

    const select = (idx: number) => {
      const items = getItems();
      if (items.length === 0) return;
      const clamped = Math.max(0, Math.min(items.length - 1, idx));
      setSelectedIndex(clamped);
      const el = items[clamped];
      el?.focus();
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    };

    const selectNext = () => select(selectedIndex + 1);
    const selectPrev = () => select(selectedIndex - 1);

    const openSelected = () => {
      const items = getItems();
      if (selectedIndex < 0 || selectedIndex >= items.length) return;
      const id = items[selectedIndex].dataset.shortcutConfession;
      if (id) router.push(`/confessions/${id}`);
    };

    const reactSelected = () => {
      const items = getItems();
      if (selectedIndex < 0 || selectedIndex >= items.length) return;
      const el = items[selectedIndex];
      // Prefer a button whose aria-label starts with "React with"
      const btn = el.querySelector<HTMLButtonElement>(
        'button[aria-label^="React with"]',
      );
      if (btn) btn.click();
    };

    const openCommentSelected = () => {
      const items = getItems();
      if (selectedIndex < 0 || selectedIndex >= items.length) return;
      const id = items[selectedIndex].dataset.shortcutConfession;
      if (id) router.push(`/confessions/${id}#comments`);
    };

    const openComposer = () => {
      const el = document.getElementById("confession-body") as
        | HTMLElement
        | null;
      if (el) {
        el.focus();
        return;
      }
      router.push("/");
      // give page a tick to mount composer
      setTimeout(() => document.getElementById("confession-body")?.focus(), 250);
    };

    const openSearch = () => {
      const input = document.querySelector<HTMLInputElement>(
        'input[placeholder*="Search"], input[aria-label*="Search"]',
      );
      if (input) {
        input.focus();
        return;
      }
      router.push("/search");
      setTimeout(() => document.querySelector<HTMLInputElement>('input[placeholder*="Search"]')?.focus(), 250);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // Respect modifier keys — only handle simple presses.
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Always let Escape through (modals handle it themselves), but
      // otherwise disable shortcuts when a dialog is open.
      const hasDialog = !!document.querySelector('[role="dialog"]');
      if (hasDialog && e.key !== "Escape") return;

      const active = document.activeElement;
      if (isEditable(active)) return;

      // Handle 'g' sequence
      if (e.key === "g") {
        e.preventDefault();
        setGPending(true);
        if (gTimer) window.clearTimeout(gTimer);
        gTimer = window.setTimeout(() => resetG(), 700);
        return;
      }

      if (gPending) {
        if (e.key === "h") {
          e.preventDefault();
          router.push("/");
          resetG();
          return;
        }
        if (e.key === "p") {
          e.preventDefault();
          router.push("/profile");
          resetG();
          return;
        }
        if (e.key === "s") {
          e.preventDefault();
          // prefer explicit settings page
          router.push("/settings/privacy");
          resetG();
          return;
        }
      }

      switch (e.key) {
        case "?":
          e.preventDefault();
          setHelpOpen(true);
          break;
        case "j":
          e.preventDefault();
          selectNext();
          break;
        case "k":
          e.preventDefault();
          selectPrev();
          break;
        case "Enter":
          e.preventDefault();
          openSelected();
          break;
        case "r":
          e.preventDefault();
          reactSelected();
          break;
        case "c":
          e.preventDefault();
          openCommentSelected();
          break;
        case "n":
          e.preventDefault();
          openComposer();
          break;
        case "/":
          e.preventDefault();
          openSearch();
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      resetG();
    };
  }, [selectedIndex, gPending]);

  return (
    <>
      {children}

      <Modal isOpen={helpOpen} onClose={() => setHelpOpen(false)} title="Keyboard Shortcuts">
        <div className="space-y-3" role="list" aria-label="Keyboard shortcut list">
          <ShortcutRow keys={["j", "k"]}>Navigate down / up in feed</ShortcutRow>
          <ShortcutRow keys={["Enter"]}>Open selected confession</ShortcutRow>
          <ShortcutRow keys={["r"]}>React to selected confession</ShortcutRow>
          <ShortcutRow keys={["c"]}>Open comment box (detail)</ShortcutRow>
          <ShortcutRow keys={["n"]}>New confession — focus composer</ShortcutRow>
          <ShortcutRow keys={["/"]}>Focus search</ShortcutRow>
          <ShortcutRow keys={["g", "h"]} alternatives={[["g", "p"], ["g", "s"]]}>Go Home / Profile / Settings</ShortcutRow>
          <ShortcutRow keys={["?"]}>Open this shortcuts help</ShortcutRow>
          <ShortcutRow keys={["Esc"]}>Close modals / help</ShortcutRow>
        </div>
        <div className="mt-6 flex justify-end">
          <Button onClick={() => setHelpOpen(false)}>Close</Button>
        </div>
      </Modal>
    </>
  );
};

const ShortcutRow: React.FC<{ keys: string[]; alternatives?: string[][]; children: React.ReactNode }> = ({
  keys,
  alternatives = [],
  children,
}) => {
  const formatKeys = (k: string[]) => k.map((key, i) => (
    <React.Fragment key={key}>
      {i > 0 && <span className="mx-1 text-zinc-500">then</span>}
      <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded border border-zinc-600 bg-zinc-800 text-xs text-zinc-200 font-mono">{key}</kbd>
    </React.Fragment>
  ));

  return (
    <div className="flex items-start justify-between gap-4 py-1" role="listitem">
      <div className="text-sm text-zinc-300">{children}</div>
      <div className="flex items-center shrink-0 text-xs text-zinc-400">
        {formatKeys(keys)}
        {alternatives.map((alternative) => (
          <React.Fragment key={alternative.join("-")}>
            <span className="mx-1 text-zinc-500">or</span>
            {formatKeys(alternative)}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export default ShortcutsProvider;
