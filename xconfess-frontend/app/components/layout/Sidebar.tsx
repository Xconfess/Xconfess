"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X, LogOut, User, MessageSquare, Home, Search, BarChart3, Anchor, Keyboard } from "lucide-react";
import { useAuth } from "../../lib/hooks/useAuth";
import { useFocusTrap } from "@/app/lib/hooks/useFocusTrap";
import { Modal } from "@/app/components/ui/modal";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, logout } = useAuth();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  useFocusTrap({
    active: isOpen,
    containerRef: panelRef,
    initialFocusRef: closeButtonRef,
    onEscape: onClose,
  });

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 md:hidden ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className={`fixed top-0 right-0 h-full w-72 max-w-[85vw] bg-background border-l border-zinc-200 dark:border-slate-800 shadow-2xl z-50 transform transition-transform duration-300 ease-in-out md:hidden ${isOpen ? "translate-x-0" : "translate-x-full"
          }`}
        role="dialog"
        aria-modal="true"
        aria-label="Mobile Navigation"
        id="mobile-navigation"
        ref={panelRef}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-slate-800">
            <span className="text-lg font-bold text-primary">xConfess</span>
            <button
              ref={closeButtonRef}
              onClick={onClose}
              className="p-2 -mr-2 text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-full hover:bg-zinc-100 dark:hover:bg-slate-800 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Close menu"
            >
              <X size={24} />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto py-4">
            <ul className="space-y-2 px-2">
              <li>
                <Link
                  href="/"
                  className="flex items-center gap-3 px-4 py-3 text-gray-700 dark:text-slate-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:text-purple-600 dark:hover:text-purple-400 rounded-lg transition-colors min-h-[44px]"
                  onClick={onClose}
                >
                  <Home size={20} />
                  <span>Feed</span>
                </Link>
              </li>
              <li>
                <Link
                  href="/search"
                  className="flex items-center gap-3 px-4 py-3 text-gray-700 dark:text-slate-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:text-purple-600 dark:hover:text-purple-400 rounded-lg transition-colors min-h-[44px]"
                  onClick={onClose}
                >
                  <Search size={20} />
                  <span>Search</span>
                </Link>
              </li>
              <li>
                <Link
                  href="/compare"
                  className="flex items-center gap-3 px-4 py-3 text-gray-700 dark:text-slate-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:text-purple-600 dark:hover:text-purple-400 rounded-lg transition-colors min-h-[44px]"
                  onClick={onClose}
                >
                  <BarChart3 size={20} />
                  <span>Compare</span>
                </Link>
              </li>
              <li>
                <Link
                  href="/profile"
                  className="flex items-center gap-3 px-4 py-3 text-gray-700 dark:text-slate-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:text-purple-600 dark:hover:text-purple-400 rounded-lg transition-colors min-h-[44px]"
                  onClick={onClose}
                >
                  <User size={20} />
                  <span>Profile</span>
                </Link>
              </li>
              <li>
                <Link
                  href="/anchors"
                  className="flex items-center gap-3 px-4 py-3 text-gray-700 dark:text-slate-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:text-purple-600 dark:hover:text-purple-400 rounded-lg transition-colors min-h-[44px]"
                  onClick={onClose}
                >
                  <Anchor size={20} />
                  <span>Anchors</span>
                </Link>
              </li>
              {user?.role === "admin" && (
                <li>
                  <Link
                    href="/admin"
                    className="flex items-center gap-3 px-4 py-3 font-bold text-gray-700 dark:text-slate-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:text-purple-600 dark:hover:text-purple-400 rounded-lg transition-colors min-h-[44px]"
                    onClick={onClose}
                  >
                    <span className="w-5 text-center">🛡️</span>
                    <span>Admin</span>
                  </Link>
                </li>
              )}
              <li>
                <Link
                  href="/messages"
                  className="flex items-center gap-3 px-4 py-3 text-gray-700 dark:text-slate-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:text-purple-600 dark:hover:text-purple-400 rounded-lg transition-colors min-h-[44px]"
                  onClick={onClose}
                >
                  <MessageSquare size={20} />
                  <span>Messages</span>
                </Link>
              </li>
            </ul>
          </nav>

          {user && (
            <div className="p-4 border-t border-zinc-200 dark:border-slate-800 bg-zinc-50 dark:bg-slate-900/50">
              <div className="flex items-center gap-3 mb-4 px-2">
                <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center text-purple-600 dark:text-purple-300 font-bold">
                  {user.username?.[0]?.toUpperCase() || "U"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {user.username}
                  </p>
                  <p className="text-xs text-secondary truncate">{user.email}</p>
                </div>
              </div>
              <button
                onClick={() => { setHelpOpen(true); }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 text-gray-600 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800 rounded-lg transition-colors border border-zinc-200 dark:border-slate-700 min-h-[44px] mb-2"
                aria-label="Keyboard shortcuts"
              >
                <Keyboard size={18} />
                <span>Shortcuts</span>
              </button>
              <button
                onClick={() => {
                  logout();
                  onClose();
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors border border-red-200 dark:border-red-900/40 min-h-[44px]"
              >
                <LogOut size={18} />
                <span>Logout</span>
              </button>
            </div>
          )}

          <KeyboardShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
        </div>
      </div>

      <KeyboardShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}

function KeyboardShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal isOpen={open} onClose={onClose} title="Keyboard Shortcuts">
      <div className="space-y-3" role="list" aria-label="Keyboard shortcut list">
        <ShortcutRow keys={["j", "k"]}>Navigate down / up in feed</ShortcutRow>
        <ShortcutRow keys={["Enter"]}>Open selected confession</ShortcutRow>
        <ShortcutRow keys={["r"]}>React to selected confession</ShortcutRow>
        <ShortcutRow keys={["c"]}>Open comment box (detail)</ShortcutRow>
        <ShortcutRow keys={["n"]}>New confession — focus composer</ShortcutRow>
        <ShortcutRow keys={["/"]}>Focus search</ShortcutRow>
        <ShortcutRow keys={["g", "h"]} or={["g", "p"]} or={["g", "s"]}>Go Home / Profile / Settings</ShortcutRow>
        <ShortcutRow keys={["?"]}>Open this shortcuts help</ShortcutRow>
        <ShortcutRow keys={["Esc"]}>Close modals / help</ShortcutRow>
      </div>
      <div className="mt-6 flex justify-end">
        <Button onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
}

function ShortcutRow({ keys, or, children }: { keys: string[]; or?: string[]; children: React.ReactNode }) {
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
        {or && (
          <>
            <span className="mx-1 text-zinc-500">or</span>
            {formatKeys(or)}
          </>
        )}
      </div>
    </div>
  );
}