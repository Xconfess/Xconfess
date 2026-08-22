import { Skeleton } from "@/components/ui/skeleton";

export default function LoginLoading() {
    return (
        <div className="editorial-shell min-h-screen px-4 py-10">
            <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-5xl items-center justify-center">
                <div className="grid w-full gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
                    {/* Left Column Hero Skeleton */}
                    <div className="space-y-5">
                        <Skeleton className="h-4 w-28 rounded-full" />
                        <div className="space-y-3">
                            <Skeleton className="h-12 w-full sm:h-14" />
                            <Skeleton className="h-12 w-4/5 sm:h-14" />
                        </div>
                        <div className="space-y-2 pt-2">
                            <Skeleton className="h-4 w-full max-w-md" />
                            <Skeleton className="h-4 w-5/6 max-w-md" />
                            <Skeleton className="h-4 w-2/3 max-w-md" />
                        </div>
                    </div>

                    {/* Right Column Form Card Skeleton */}
                    <div className="luxury-panel rounded-[34px] p-7 sm:p-8">
                        <div className="space-y-3">
                            <Skeleton className="h-4 w-32 rounded-full" />
                            <Skeleton className="h-9 w-28" />
                            <Skeleton className="h-4 w-3/4 max-w-xs" />
                        </div>

                        <div className="mt-6 space-y-4">
                            {/* Email Field */}
                            <div className="space-y-2">
                                <Skeleton className="h-4 w-12" />
                                <Skeleton className="h-10 w-full rounded-md" />
                            </div>

                            {/* Password Field */}
                            <div className="space-y-2">
                                <Skeleton className="h-4 w-16" />
                                <Skeleton className="h-10 w-full rounded-md" />
                            </div>

                            {/* Forgot password link */}
                            <Skeleton className="h-4 w-28" />

                            {/* Submit Button */}
                            <Skeleton className="h-10 w-full rounded-md" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}