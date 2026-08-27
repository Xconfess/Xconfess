"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { OnboardingState, TutorialStep, TUTORIAL_STEPS } from "../types/onboarding.types";

interface OnboardingStore extends OnboardingState {
  tutorialSteps: TutorialStep[];
  completeStep: (stepId: string) => void;
  skipOnboarding: () => void;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
  setCurrentStep: (step: number) => void;
  markWelcomeSeen: () => void;
  completeTutorialStep: (stepId: string) => void;
  getTutorialProgress: () => number;
}

const initialState: OnboardingState = {
  isCompleted: false,
  completedSteps: [],
  currentStep: 0,
  hasSeenWelcome: false
};

export const useOnboardingStore = create<OnboardingStore>()(
  persist(
    (set, get) => ({
      ...initialState,
      tutorialSteps: TUTORIAL_STEPS,

      completeStep: (stepId) => set(state => ({ completedSteps: [...new Set([...state.completedSteps, stepId])] })),

      skipOnboarding: () => set({ isCompleted: true, skippedAt: new Date().toISOString(), currentStep: 0 }),

      completeOnboarding: () => set({ isCompleted: true, completedAt: new Date().toISOString(), currentStep: 0 }),

      resetOnboarding: () => set({ ...initialState, tutorialSteps: TUTORIAL_STEPS }),

      setCurrentStep: (step) => set({ currentStep: step }),

      markWelcomeSeen: () => set({ hasSeenWelcome: true }),

      completeTutorialStep: (stepId) => {
        set(state => ({ tutorialSteps: state.tutorialSteps.map(s => s.id === stepId ? { ...s, completed: true } : s) }));
        get().completeStep(stepId);
      },

      getTutorialProgress: () => {
        const steps = get().tutorialSteps;
        const completed = steps.filter(s => s.completed).length;
        return Math.round((completed / steps.length) * 100);
      }
    }),
    { name: "xconfess-onboarding" }
  )
);
