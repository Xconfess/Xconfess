import { redirect } from "next/navigation";

export default function DashboardRoute() {
  // XConfess is intentionally public and wallet-first. The old dashboard
  // depended on authenticated user statistics and caused needless 401s.
  redirect("/");
}
