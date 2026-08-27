import { ConfessionDetailSkeleton } from "@/app/components/confession/LoadingSkeleton";

export default function ConfessionDetailLoading() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950">
      <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
        <ConfessionDetailSkeleton />
      </div>
    </div>
  );
}
