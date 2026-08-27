import { Skeleton } from "@/components/ui/skeleton";

export default function RegisterLoading() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
            <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4">
                {/* Header Title & Link Skeleton */}
                <div className="space-y-2">
                    <Skeleton className="h-7 w-44" />
                    <Skeleton className="h-4 w-60" />
                </div>

                {/* Inputs Stack Skeleton */}
                <div className="space-y-3 pt-2">
                    {/* Username Field */}
                    <div className="space-y-1">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-10 w-full rounded-md" />
                    </div>

                    {/* Email Field */}
                    <div className="space-y-1">
                        <Skeleton className="h-4 w-12" />
                        <Skeleton className="h-10 w-full rounded-md" />
                    </div>

                    {/* Password Field */}
                    <div className="space-y-1">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-10 w-full rounded-md" />
                    </div>

                    {/* Confirm Password Field */}
                    <div className="space-y-1">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-10 w-full rounded-md" />
                    </div>

                    {/* Submit Button */}
                    <Skeleton className="h-10 w-full rounded-md" />
                </div>
            </div>
        </div>
    );
}