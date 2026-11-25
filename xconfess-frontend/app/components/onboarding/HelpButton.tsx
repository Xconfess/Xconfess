"use client";

import { useState } from "react";
import { HelpCircle, Book, RotateCcw, X } from "lucide-react";
import { useOnboardingStore } from "@/app/lib/store/onboardingStore";

export const HelpButton = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { resetOnboarding } = useOnboardingStore();

  const handleRestartTour = () => {
    resetOnboarding();
    setIsOpen(false);
    window.location.reload(); // Reload to restart tour
  };

  const helpLinks = [
    {
      title: "Getting Started Guide",
      description: "Learn the basics of XConfess",
      icon: Book,
      href: "/docs/getting-started",
    },
    {
      title: "Stellar Integration",
      description: "How to use blockchain features",
      icon: Book,
      href: "/docs/stellar-integration",
    },
    {
      title: "Privacy & Safety",
      description: "Understanding anonymity",
      icon: Book,
      href: "/docs/privacy",
    },
  ];

  return (
    <div className="fixed bottom-4 left-4 z-40">
      {/* Help button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 bg-[var(--primary)] hover:bg-[var(--primary-hover)] rounded-full flex items-center justify-center transition-all transform"
        aria-label="Help"
      >
        {isOpen ? (
          <X className="w-6 h-6 text-[var(--foreground)]" />
        ) : (
          <HelpCircle className="w-6 h-6 text-[var(--foreground)]" />
        )}
      </button>

      {/* Help menu */}
      {isOpen && (
        <div className="absolute bottom-16 left-0 w-80 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-[var(--shadow-popover)] overflow-hidden">
          <div className="p-4 bg-[var(--primary)] ">
            <h3 className="font-semibold text-[var(--foreground)]">Need Help?</h3>
            <p className="text-sm text-[var(--secondary)] mt-1">
              We're here to help you get started
            </p>
          </div>

          <div className="p-4 space-y-2">
            {/* Restart tour */}
            <button
              onClick={handleRestartTour}
              className="w-full flex items-center gap-3 p-3 bg-[var(--surface-muted)] hover:bg-[var(--surface-elevated)] rounded-lg transition-colors text-left"
            >
              <div className="w-10 h-10 bg-[var(--accent-soft)] rounded-lg flex items-center justify-center">
                <RotateCcw className="w-5 h-5 text-[var(--primary-deep)]" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-[var(--foreground)] text-sm">Restart Tour</h4>
                <p className="text-xs text-[var(--text-muted)]">Take the tutorial again</p>
              </div>
            </button>

            {/* Help links */}
            {helpLinks.map((link) => {
              const Icon = link.icon;
              return (
                <a
                  key={link.title}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 bg-[var(--surface-muted)] hover:bg-[var(--surface-elevated)] rounded-lg transition-colors"
                >
                  <div className="w-10 h-10 bg-[var(--accent-soft)] rounded-lg flex items-center justify-center">
                    <Icon className="w-5 h-5 text-[var(--primary-deep)]" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-[var(--foreground)] text-sm">
                      {link.title}
                    </h4>
                    <p className="text-xs text-[var(--text-muted)]">{link.description}</p>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
