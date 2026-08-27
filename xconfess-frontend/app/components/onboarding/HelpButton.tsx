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
        className="w-14 h-14 bg-purple-600 hover:bg-purple-700 rounded-full flex items-center justify-center shadow-lg transition-all transform hover:scale-110"
        aria-label="Help"
      >
        {isOpen ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <HelpCircle className="w-6 h-6 text-white" />
        )}
      </button>

      {/* Help menu */}
      {isOpen && (
        <div className="absolute bottom-16 left-0 w-80 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden">
          <div className="p-4 bg-linear-to-r from-purple-900 to-blue-900">
            <h3 className="font-semibold text-white">Need Help?</h3>
            <p className="text-sm text-gray-300 mt-1">
              We're here to help you get started
            </p>
          </div>

          <div className="p-4 space-y-2">
            {/* Restart tour */}
            <button
              onClick={handleRestartTour}
              className="w-full flex items-center gap-3 p-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors text-left"
            >
              <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                <RotateCcw className="w-5 h-5 text-purple-400" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-white text-sm">Restart Tour</h4>
                <p className="text-xs text-gray-400">Take the tutorial again</p>
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
                  className="flex items-center gap-3 p-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
                >
                  <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                    <Icon className="w-5 h-5 text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-white text-sm">
                      {link.title}
                    </h4>
                    <p className="text-xs text-gray-400">{link.description}</p>
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
