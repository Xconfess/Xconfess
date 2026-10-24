"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronUp, Trophy } from "lucide-react";
import { useOnboardingStore } from "@/app/lib/store/onboardingStore";

export const OnboardingChecklist = () => {
  const { tutorialSteps, getTutorialProgress } = useOnboardingStore();
  const [isExpanded, setIsExpanded] = useState(false);

  const progress = getTutorialProgress();
  const completedCount = tutorialSteps.filter((s) => s.completed).length;
  const totalCount = tutorialSteps.length;
  const isComplete = completedCount === totalCount;

  if (isComplete && !isExpanded) return null;

  return (
    <div className="fixed bottom-5 right-5 z-40 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] shadow-[0_28px_80px_-45px_rgba(15,23,42,0.55)] backdrop-blur-xl">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-[var(--surface-muted)]"
      >
        <div>
          <h4 className="font-semibold text-[var(--foreground)]">Getting Started</h4>
          <p className="text-xs text-[var(--text-muted)]">
            {completedCount} of {totalCount} completed
          </p>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-5 w-5 text-[var(--text-muted)]" />
        ) : (
          <ChevronDown className="h-5 w-5 text-[var(--text-muted)]" />
        )}
      </button>

      {isExpanded && (
        <>
          <div className="mx-4 mt-1 h-2 rounded-full bg-[var(--skeleton)]">
            <div
              className="h-2 rounded-full bg-[var(--surface)] transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="space-y-2 p-4">
            {tutorialSteps.map((step) => (
              <div
                key={step.id}
                className={`flex items-start gap-3 rounded-2xl border p-3 transition-all ${
                  step.completed
                    ? "border-[var(--success)]/30 bg-[var(--success)]/10"
                    : "border-[var(--border)] bg-[var(--surface-muted)]"
                }`}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--surface)] shadow-sm">
                  {step.completed ? (
                    <Check className="h-5 w-5 text-[var(--success)]" />
                  ) : (
                    <span aria-hidden="true">{step.icon}</span>
                  )}
                </div>

                <div className="flex-1">
                  <h5 className="font-medium text-[var(--foreground)]">{step.title}</h5>
                  <p className="text-sm text-[var(--text-muted)]">{step.description}</p>
                </div>

                {step.required && !step.completed && (
                  <span className="rounded-full bg-[var(--danger)]/10 px-2 py-0.5 text-xs font-semibold text-[var(--danger)]">
                    Required
                  </span>
                )}
              </div>
            ))}

            {isComplete && (
              <div className="mt-3 flex items-center gap-2 rounded-2xl bg-[var(--success)]/10 p-3 font-semibold text-[var(--success)]">
                <Trophy className="h-5 w-5" />
                Congratulations! You've completed all onboarding steps.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
