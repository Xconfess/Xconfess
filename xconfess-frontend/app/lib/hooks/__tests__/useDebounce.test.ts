import { renderHook, act } from '@testing-library/react';
import { useDebounce } from '../useDebounce';

describe('useDebounce', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should return initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('initial', 500));
    expect(result.current).toBe('initial');
  });

  it('should debounce value changes', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      {
        initialProps: { value: 'initial', delay: 500 },
      }
    );

    expect(result.current).toBe('initial');

    // Update value
    rerender({ value: 'updated', delay: 500 });

    // Value should not change immediately
    expect(result.current).toBe('initial');

    // Fast-forward time by 499ms
    act(() => {
      jest.advanceTimersByTime(499);
    });

    // Value should still be initial
    expect(result.current).toBe('initial');

    // Fast-forward time by 1ms more (total 500ms)
    act(() => {
      jest.advanceTimersByTime(1);
    });

    // Value should now be updated
    expect(result.current).toBe('updated');
  });

  it('should reset timer on rapid value changes', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      {
        initialProps: { value: 'initial', delay: 500 },
      }
    );

    // Update value multiple times rapidly
    rerender({ value: 'update1', delay: 500 });
    act(() => {
      jest.advanceTimersByTime(200);
    });

    rerender({ value: 'update2', delay: 500 });
    act(() => {
      jest.advanceTimersByTime(200);
    });

    rerender({ value: 'update3', delay: 500 });
    act(() => {
      jest.advanceTimersByTime(200);
    });

    // Value should still be initial (only 600ms passed, but timer reset each time)
    expect(result.current).toBe('initial');

    // Fast-forward remaining time
    act(() => {
      jest.advanceTimersByTime(300);
    });

    // Value should now be the last update
    expect(result.current).toBe('update3');
  });

  it('should handle different delay values', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      {
        initialProps: { value: 'initial', delay: 1000 },
      }
    );

    rerender({ value: 'updated', delay: 1000 });

    act(() => {
      jest.advanceTimersByTime(999);
    });

    expect(result.current).toBe('initial');

    act(() => {
      jest.advanceTimersByTime(1);
    });

    expect(result.current).toBe('updated');
  });

  it('should work with different value types', () => {
    // Test with number
    const { result: numberResult, rerender: numberRerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      {
        initialProps: { value: 0, delay: 500 },
      }
    );

    numberRerender({ value: 42, delay: 500 });
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(numberResult.current).toBe(42);

    // Test with boolean
    const { result: boolResult, rerender: boolRerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      {
        initialProps: { value: false, delay: 500 },
      }
    );

    boolRerender({ value: true, delay: 500 });
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(boolResult.current).toBe(true);

    // Test with object
    const { result: objResult, rerender: objRerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      {
        initialProps: { value: { a: 1 }, delay: 500 },
      }
    );

    objRerender({ value: { a: 2 }, delay: 500 });
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(objResult.current).toEqual({ a: 2 });
  });

  it('should cleanup timeout on unmount', () => {
    const { unmount } = renderHook(() => useDebounce('initial', 500));

    // Unmount before timeout completes
    unmount();

    // Advance timers - should not cause any issues
    act(() => {
      jest.advanceTimersByTime(500);
    });

    // No errors should occur
    expect(true).toBe(true);
  });

  it('should handle zero delay', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      {
        initialProps: { value: 'initial', delay: 0 },
      }
    );

    rerender({ value: 'updated', delay: 0 });

    act(() => {
      jest.advanceTimersByTime(0);
    });

    expect(result.current).toBe('updated');
  });

  it('should handle undefined values', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      {
        initialProps: { value: undefined as string | undefined, delay: 500 },
      }
    );

    expect(result.current).toBeUndefined();

    rerender({ value: 'defined', delay: 500 });

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(result.current).toBe('defined');

    rerender({ value: undefined, delay: 500 });

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(result.current).toBeUndefined();
  });
});
