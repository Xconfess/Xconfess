import { useCallback } from 'react';
import { toast } from 'sonner';
import { 
  normalizeError, 
  getUserFriendlyMessage, 
  shouldRetry 
} from '../api/errorHandler';

export function useErrorToast() {
  const showError = useCallback((error: unknown, options?: { 
    retryAction?: () => void;
    duration?: number;
  }) => {
    const normalized = normalizeError(error);
    const message = getUserFriendlyMessage(normalized);
    const retryable = shouldRetry(normalized);
    
    if (retryable && options?.retryAction) {
      toast.error(message, {
        action: {
          label: 'Retry',
          onClick: options.retryAction,
        },
        duration: options?.duration ?? 5000,
      });
    } else {
      toast.error(message, {
        duration: options?.duration ?? 4000,
      });
    }
  }, []);

  const showSuccess = useCallback((message: string) => {
    toast.success(message);
  }, []);

  return { showError, showSuccess };
}
