"use client";

import { useEffect, useState } from "react";
import { useOnboardingStore } from "@/app/lib/store/onboardingStore";
import { WelcomeScreen } from "./WelcomeScreen";
import { FeatureTour } from "./FeatureTour";
import { OnboardingChecklist } from "./OnboardingChecklist";
import { ONBOARDING_STEPS } from "@/app/lib/types/onboarding.types";

export const OnboardingFlow = () => {
  const {
    isCompleted,
    hasSeenWelcome,
    markWelcomeSeen,
    skipOnboarding,
    completeOnboarding,
  } = useOnboardingStore();

  const [showWelcome, setShowWelcome] = useState(false);
  const [runTour, setRunTour] = useState(false);

  useEffect(() => {
    if (!isCompleted && !hasSeenWelcome) {
      setTimeout(() => setShowWelcome(true), 500);
    }
  }, [isCompleted, hasSeenWelcome]);

  // ✅ Wait until all targets exist in the DOM

  // Welcome modal button handlers
  const handleStartTour = () => {
    markWelcomeSeen();
    setShowWelcome(false);

    const OPTIONAL_STEP_IDS = new Set(["stellar-wallet", "anchor-action"]);

    const startWhenReady = () => {
      const requiredSteps = ONBOARDING_STEPS.filter(
        (step) => !OPTIONAL_STEP_IDS.has(step.id),
      );
      const requiredExist = requiredSteps.every((step) =>
        document.querySelector(step.target),
      );

      if (requiredExist) {
        setRunTour(true);
      } else {
        setTimeout(startWhenReady, 100);
      }
    };

    setTimeout(startWhenReady, 300);
  };

  const handleSkipWelcome = () => {
    markWelcomeSeen();
    setShowWelcome(false);
    skipOnboarding();
  };

  const handleCompleteTour = () => {
    setRunTour(false);
    completeOnboarding();
  };

  const handleSkipTour = () => {
    setRunTour(false);
    skipOnboarding();
  };

  return (
    <>
      {showWelcome && (
        <WelcomeScreen onStart={handleStartTour} onSkip={handleSkipWelcome} />
      )}

      {runTour && !isCompleted && (
        <FeatureTour
          run={runTour}
          onComplete={handleCompleteTour}
          onSkip={handleSkipTour}
        />
      )}

      {!isCompleted && <OnboardingChecklist />}
    </>
  );
};
