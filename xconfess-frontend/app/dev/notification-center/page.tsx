import { ToastProvider } from "@/app/components/common/Toast";
import { NotificationCenter } from "@/app/components/notifications/NotificationCenter";

/**
 * Dev-only preview route for the notification center.
 *
 * This is intentionally excluded from production builds so the visual
 * regression suite can exercise the component with stable network mocks
 * (see tests/e2e/notification-center.spec.ts) without depending on a live
 * backend.
 */
export default function NotificationCenterPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <p className="text-sm text-[var(--text-muted)]">
          Notification center preview is only available in development.
        </p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-start justify-center bg-[var(--surface-muted)] p-8">
      <ToastProvider>
        <NotificationCenter />
      </ToastProvider>
    </main>
  );
}
