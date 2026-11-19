import { useTransition } from "react";

export interface LoadingBoundaryOptions {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export function useLoadingBoundary(options: LoadingBoundaryOptions = {}) {
  const [isPending, startTransition] = useTransition();

  const withLoading = async <T,>(
    fn: () => Promise<T>
  ): Promise<T | undefined> => {
    return new Promise((resolve) => {
      startTransition(async () => {
        try {
          const result = await fn();
          options.onSuccess?.();
          resolve(result);
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          options.onError?.(err);
          resolve(undefined);
        }
      });
    });
  };

  return { isPending, withLoading };
}

type SkeletonType = "text" | "card" | "line" | "circle" | "button";

export const skeletonConfig: Record<
  SkeletonType,
  { width: string; height: string; className: string }
> = {
  text: { width: "w-full", height: "h-4", className: "rounded" },
  card: { width: "w-full", height: "h-24", className: "rounded-lg" },
  line: { width: "w-full", height: "h-2", className: "rounded" },
  circle: { width: "w-10", height: "h-10", className: "rounded-full" },
  button: { width: "w-24", height: "h-10", className: "rounded-md" },
};

export const loadingBoundaryConfig = {
  dashboard: {
    type: "skeleton" as const,
    preserveLayout: true,
    announcement: "Loading dashboard content",
  },
  search: {
    type: "skeleton" as const,
    preserveLayout: true,
    announcement: "Loading search results",
  },
  profile: {
    type: "skeleton" as const,
    preserveLayout: true,
    announcement: "Loading profile information",
  },
  feed: {
    type: "skeleton" as const,
    preserveLayout: true,
    announcement: "Loading confessions feed",
  },
  modal: {
    type: "spinner" as const,
    preserveLayout: false,
    announcement: "Loading dialog content",
  },
  form: {
    type: "spinner" as const,
    preserveLayout: false,
    announcement: "Processing form submission",
  },
};

export type LoadingBoundaryType = keyof typeof loadingBoundaryConfig;

export function getLoadingBoundaryConfig(type: LoadingBoundaryType) {
  return loadingBoundaryConfig[type];
}
