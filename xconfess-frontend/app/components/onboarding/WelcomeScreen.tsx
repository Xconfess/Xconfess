"use client";

import { useState } from "react";
import { Heart, Lock, Sparkles, X, Zap } from "lucide-react";

interface Props {
  onStart: () => void;
  onSkip: () => void;
  onClose?: () => void;
}

export const WelcomeScreen = ({ onStart, onSkip, onClose }: Props) => {
  const [show, setShow] = useState(true);

  if (!show) return null;

  const features = [
    {
      icon: Lock,
      title: "Anonymous & Safe",
      description: "Share freely without revealing your identity.",
    },
    {
      icon: Heart,
      title: "Community Support",
      description: "React with empathy and discover honest conversations.",
    },
    {
      icon: Sparkles,
      title: "Blockchain Powered",
      description: "Optional Stellar anchoring for proof-of-existence.",
    },
    {
      icon: Zap,
      title: "Simple & Fast",
      description: "A focused composer built for quick, thoughtful posting.",
    },
  ];

  const handleStart = () => {
    setShow(false);
    onStart();
  };

  const handleSkip = () => {
    setShow(false);
    onSkip();
  };

  const handleClose = () => {
    setShow(false);
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div className="luxury-panel relative w-full max-w-2xl overflow-hidden rounded-[28px] p-7">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-[radial-gradient(circle_at_top,var(--accent-soft),transparent_60%)]" />

        <button
          className="absolute right-4 top-4 rounded-full p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
          onClick={handleClose}
          aria-label="Close onboarding"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="relative space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
            Welcome
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-950">
            Welcome to XConfess
          </h2>
          <p className="max-w-xl text-sm leading-7 text-zinc-600 sm:text-base">
            A calmer space for anonymous confessions, supportive reactions, and
            optional Stellar-backed permanence when you need it.
          </p>
        </div>

        <div className="relative mb-7 mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-4"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/75 shadow-sm">
                  <Icon className="h-5 w-5 text-[var(--primary-deep)]" />
                </div>
                <div>
                  <h3 className="font-semibold text-zinc-950">
                    {feature.title}
                  </h3>
                  <p className="text-sm leading-6 text-zinc-600">
                    {feature.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="relative flex flex-col gap-3 sm:flex-row">
          <button
            onClick={handleStart}
            className="flex-1 rounded-full bg-zinc-950 py-3 text-white transition hover:bg-zinc-800"
          >
            Start Tour
          </button>
          <button
            onClick={handleSkip}
            className="flex-1 rounded-full border border-zinc-300 py-3 text-zinc-700 transition hover:bg-zinc-100"
          >
            Skip & Explore
          </button>
        </div>

        <p className="mt-4 text-center text-xs text-zinc-500">
          You can restart the tour anytime from settings.
        </p>
      </div>
    </div>
  );
};
