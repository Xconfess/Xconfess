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

export const metadata: Metadata = {
  title: "xConfess - Anonymous Confessions on Stellar",
  description: "Share your thoughts anonymously with blockchain verification",
  generator: "v0.app",
  manifest: "/manifest.webmanifest",
};

import { NetworkBanner } from "@/app/components/common/NetworkBanner";
import { WebSocketIndicator } from "@/app/components/common/WebSocketIndicator";

import { NetworkStatusProvider } from "@/app/lib/providers/NetworkStatusProvider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
      </head>
      <body className="antialiased">
        <Script
          id="sw-register"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js')}`,
          }}
        />
        <ErrorBoundary>
          <ThemeProvider>
            <AuthProvider>
              <NetworkStatusProvider>
                <QueryProvider>
                  <ToastProvider>
                    <NetworkBanner />
                    <WebSocketIndicator />
                    {children}

                    {/* Onboarding system */}
                    <OnboardingFlow />
                    <HelpButton />
                  </ToastProvider>
                </QueryProvider>
              </NetworkStatusProvider>
            </AuthProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
