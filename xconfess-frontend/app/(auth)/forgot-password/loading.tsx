import { Skeleton } from "@/components/ui/skeleton";

export default function ForgotPasswordLoading() {
    return (
        <div className="editorial-shell min-h-screen px-4 py-10">
            <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-5xl items-center justify-center">
                <div className="grid w-full gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">

                    {/* Left Column Hero Skeleton */}
                    <div className="space-y-5">
                        <Skeleton className="h-4 w-28 rounded-full" /> {/* eyebrow */}
                        <Skeleton className="h-12 w-4/5 sm:h-14" />      {/* h1 title */}
                        <div className="space-y-2 pt-1">
                            <Skeleton className="h-4 w-full max-w-md" /> {/* description line 1 */}
                            <Skeleton className="h-4 w-3/4 max-w-md" />  {/* description line 2 */}
                        </div>
                    </div>

                    {/* Right Column Form Skeleton */}
                    <div className="luxury-panel rounded-[34px] p-7 sm:p-8">
                        <div className="space-y-3">
                            <Skeleton className="h-4 w-28 rounded-full" /> {/* eyebrow */}
                            <Skeleton className="h-9 w-48" />             {/* h2 reset request */}
                            <Skeleton className="h-4 w-full max-w-xs" />  {/* subtitle */}
                        </div>

                        <div className="mt-6 space-y-4">
                            {/* Email Label & Input */}
                            <div>
                                <Skeleton className="mb-2 h-4 w-12" />
                                <Skeleton className="h-10 w-full rounded-md" />
                            </div>

                            {/* Submit Button */}
                            <Skeleton className="h-10 w-full rounded-md" />

                            {/* Sign-in link text */}
                            <Skeleton className="h-4 w-52" />
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}