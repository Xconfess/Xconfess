export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  target: string;
  placement?: "top" | "bottom" | "left" | "right" | "center";
  disableBeacon?: boolean;
  spotlightClicks?: boolean;
}

export interface OnboardingState {
  isCompleted: boolean;
  completedSteps: string[];
  skippedAt?: string;
  completedAt?: string;
  currentStep: number;
  hasSeenWelcome: boolean;
}

export interface TutorialStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  required: boolean;
  icon: string;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  { id: "welcome", title: "👋 Welcome to XConfess", description: "Share thoughts anonymously!", target: "body", placement: "center", disableBeacon: true },
  { id: "confession-feed", title: "📝 Confession Feed", description: "Browse anonymous confessions", target: ".confession-feed", placement: "bottom" },
  { id: "create-confession", title: "✨ Share Your Thoughts", description: "Click here to post", target: ".create-confession-button", placement: "bottom", spotlightClicks: true },
  { id: "reactions", title: "❤️ React to Confessions", description: "Support with reactions", target: ".reaction-buttons", placement: "top" },
  { id: "stellar-wallet", title: "🔗 Create an XConfess Wallet (Optional)", description: "Create a wallet in XConfess to unlock optional Stellar features like tipping and proof.", target: ".stellar-wallet-cta", placement: "left" },
  { id: "anchor-action", title: "⚓ Add Stellar proof (Optional)", description: "Anchor a confession to Stellar when you choose. Your social experience never requires a wallet.", target: ".stellar-anchor-action", placement: "top" },
];

export const TUTORIAL_STEPS: TutorialStep[] = [
  { id: "first-confession", title: "Post Your First Confession", description: "Share something", completed: false, required: true, icon: "📝" },
  { id: "react-confession", title: "React to a Confession", description: "Show support", completed: false, required: true, icon: "❤️" },
  { id: "explore-feed", title: "Explore the Feed", description: "Browse confessions", completed: false, required: false, icon: "🔍" },
  { id: "connect-wallet", title: "Create XConfess Wallet", description: "Unlock optional Stellar features", completed: false, required: false, icon: "🌟" },
  { id: "anchor-confession", title: "Anchor a Confession", description: "Store permanently", completed: false, required: false, icon: "⚓" },
];
