// app/(dashboard)/confessions/not-found.tsx
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function ConfessionNotFound() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 flex items-center justify-center px-4">
      <div className="text-center space-y-4">
        <p className="text-5xl">🕳️</p>
        <h1 className="text-xl font-semibold text-white">
          Confession not found
        </h1>
        <p className="text-sm text-zinc-500">
          This confession may have been removed or the link is broken.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Feed
        </Link>
      </div>
    </div>
  );
}
