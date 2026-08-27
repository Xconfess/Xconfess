"use client";

import { AuthGuard } from "@/app/components/AuthGuard";
import DashboardPage from "@/app/(dashboard)/DashboardPage";

export default function DashboardRoute() {
  return (
    <AuthGuard>
      <DashboardPage />
    </AuthGuard>
  );
}
