"use client";

import { useEffect, useState, useMemo } from "react";
import { ONBOARDING_STEPS } from "@/app/lib/types/onboarding.types";
import { useOnboardingStore } from "@/app/lib/store/onboardingStore";
import { getEmbeddedWallet } from "@/app/lib/crypto/embeddedWallet";

const WALLET_ROUTE = "/wallet";

const STELLAR_STEP_IDS = new Set(["stellar-wallet", "anchor-action"]);

function isWalletAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return !!getEmbeddedWallet() || !!(window as unknown as Record<string, unknown>).freighter;
}

interface Props {
  run: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

export const FeatureTour = ({ run, onComplete, onSkip }: Props) => {
  const { setCurrentStep, completeStep } = useOnboardingStore();
  const [stepIndex, setStepIndex] = useState(0);
  const [walletAvailable, setWalletAvailable] = useState(false);

  useEffect(() => {
    setWalletAvailable(isWalletAvailable());
  }, []);

  const visibleSteps = useMemo(
    () =>
      ONBOARDING_STEPS.filter((s) => {
        if (!STELLAR_STEP_IDS.has(s.id)) return true;
        const el = document.querySelector(s.target);
        return !!el;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [run],
  );

  const step = visibleSteps[stepIndex];
  const isLastStep = stepIndex === visibleSteps.length - 1;

  useEffect(() => {
    if (!run || !step) return;

    const target = document.querySelector(step.target);
    if (!target) return;

    target.classList.add("ring-2", "ring-[var(--focus-ring)]", "rounded-lg");
    (target as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });

    return () => {
      target.classList.remove("ring-2", "ring-[var(--focus-ring)]", "rounded-lg");
    };
  }, [run, step]);

  if (!run || !step) return null;

  const isStellarStep = STELLAR_STEP_IDS.has(step.id);

  const handleNext = () => {
    completeStep(step.id);
    setCurrentStep(stepIndex + 1);

    if (isLastStep) {
      onComplete();
      const postButton = document.querySelector<HTMLButtonElement>(
        ".create-confession-button",
      );
      if (postButton) {
        postButton.classList.add("animate-pulse");
        postButton.focus();
      }
      return;
    }

    setStepIndex((prev) => prev + 1);
  };

  const handleBack = () => {
    setStepIndex((prev) => Math.max(prev - 1, 0));
  };

  return (
    <div className="fixed inset-0 z-[10000] bg-black/70 flex items-end md:items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-popover)]">
        <p className="text-xs uppercase tracking-wide text-[var(--text-muted)] mb-2">
          Step {stepIndex + 1} of {visibleSteps.length}
        </p>
        <h3 className="text-lg font-semibold text-[var(--foreground)]">{step.title}</h3>
        <p className="mt-2 text-sm text-[var(--secondary)]">{step.description}</p>

        {isStellarStep && !walletAvailable && (
          <div className="mt-3 rounded-md border border-[var(--warning)]/30 bg-[var(--warning)]/10 px-3 py-2">
            <p className="text-xs text-[var(--warning)]">
              No Stellar wallet is set up yet.{" "}
              <a
                href={WALLET_ROUTE}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-[var(--warning)]"
              >
                Create an XConfess Wallet
              </a>{" "}
              to use optional Stellar features.
            </p>
          </div>
        )}

        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            onClick={onSkip}
            className="text-sm text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors"
          >
            Skip tour
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleBack}
              disabled={stepIndex === 0}
              className="px-3 py-2 text-sm rounded-md bg-[var(--surface-elevated)] text-[var(--foreground)] disabled:opacity-40"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="px-3 py-2 text-sm rounded-md bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]"
            >
              {isLastStep ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
