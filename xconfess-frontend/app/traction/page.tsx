import type { Metadata } from "next";
import Header from "@/app/components/layout/Header";
import { TractionDashboard } from "./traction-dashboard";

export const metadata: Metadata = {
  title: "Xconfess Traction",
  description:
    "Privacy-safe public traction metrics for Xconfess product usage and Stellar activity.",
  openGraph: {
    title: "Xconfess Traction",
    description:
      "Aggregate-only product usage and Stellar activity metrics for Xconfess.",
    url: "https://xconfess.vercel.app/traction",
    siteName: "Xconfess",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Xconfess Traction",
    description:
      "Aggregate-only product usage and Stellar activity metrics for Xconfess.",
  },
};

export default function TractionPage() {
  return (
    <>
      <Header />
      <TractionDashboard />
    </>
  );
}
