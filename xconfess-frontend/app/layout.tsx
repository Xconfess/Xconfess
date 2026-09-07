import React from "react";
import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import QueryProvider from "./components/providers/QueryProvider";
import { AuthProvider } from "./lib/providers/AuthProvider";
import { ThemeProvider } from "./lib/providers/ThemeProvider";
import { ToastProvider } from "@/app/components/common/Toast";
import { ErrorBoundary } from "@/app/components/common/ErrorBoundary";

import { OnboardingFlow } from "@/app/components/onboarding/OnboardingFlow";
import { HelpButton } from "@/app/components/onboarding/HelpButton";
import { NetworkBanner } from "@/app/components/common/NetworkBanner";
import { WebSocketIndicator } from "@/app/components/common/WebSocketIndicator";
import { NetworkStatusProvider } from "@/app/lib/providers/NetworkStatusProvider";
import ShortcutsProvider from "@/app/components/common/ShortcutsProvider";
import { WalletProvider } from "@/lib/providers/WalletProvider";

export const metadata: Metadata = {
  title: "xConfess - Anonymous Confessions",
  description: "A private, premium space for anonymous expression.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/branding/favicon.ico" },
      { url: "/branding/xconfess-icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/branding/favicon.ico",
    apple: "/branding/xconfess-icon.svg",
  },
};

const registerServiceWorkerScript = `
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(console.error);
  });
}
`;

const unregisterServiceWorkerScript = `
if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((registrations) =>
      Promise.all(registrations.map((registration) => registration.unregister())),
    )
    .then(() => {
      if ('caches' in window) {
        return caches
          .keys()
          .then((keys) =>
            Promise.all(
              keys
                .filter((key) => key.startsWith('xconfess-'))
                .map((key) => caches.delete(key)),
            ),
          );
      }
    })
    .catch(console.error);
}
`;

const serviceWorkerScript =
  process.env.NODE_ENV === "production"
    ? registerServiceWorkerScript
    : unregisterServiceWorkerScript;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#080706" />
      </head>
      <body className="antialiased">
        <Script
          id="sw-register"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: serviceWorkerScript,
          }}
        />
        <ErrorBoundary>
          <ThemeProvider>
            <AuthProvider>
              <WalletProvider>
              <NetworkStatusProvider>
                <QueryProvider>
                  <ToastProvider>
                    <ShortcutsProvider>
                    <NetworkBanner />
                    <WebSocketIndicator />
                    {children}

                    </ShortcutsProvider>

                    {/* Onboarding system */}
                    <OnboardingFlow />
                    <HelpButton />
                  </ToastProvider>
                </QueryProvider>
              </NetworkStatusProvider>
              </WalletProvider>
            </AuthProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
