/**
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';
import { useDLQFilterState } from '../useDLQFilterState';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/admin/notifications',
  useSearchParams: jest.fn(),
}));

import { useSearchParams } from 'next/navigation';

function setParams(init = '') {
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(init));
}

describe('useDLQFilterState — URL hydration', () => {
  beforeEach(() => {
    mockPush.mockClear();
    setParams('');
  });

  it('returns defaults when URL has no params', () => {
    const { result } = renderHook(() => useDLQFilterState());
    expect(result.current.page).toBe(1);
    expect(result.current.statusFilter).toBe('failed');
    expect(result.current.startDate).toBe('');
    expect(result.current.endDate).toBe('');
    expect(result.current.minRetries).toBeUndefined();
  });

  it('reads status=all from URL', () => {
    setParams('status=all');
    const { result } = renderHook(() => useDLQFilterState());
    expect(result.current.statusFilter).toBe('all');
  });

  it('defaults statusFilter to "failed" when status param is absent', () => {
    setParams('');
    const { result } = renderHook(() => useDLQFilterState());
    expect(result.current.statusFilter).toBe('failed');
  });

  it('reads page from URL', () => {
    setParams('page=4');
    const { result } = renderHook(() => useDLQFilterState());
    expect(result.current.page).toBe(4);
  });

  it('clamps page to 1 when URL param is invalid', () => {
    setParams('page=abc');
    const { result } = renderHook(() => useDLQFilterState());
    expect(result.current.page).toBe(1);
  });

  it('reads startDate and endDate from URL', () => {
    setParams('startDate=2024-01-01&endDate=2024-12-31');
    const { result } = renderHook(() => useDLQFilterState());
    expect(result.current.startDate).toBe('2024-01-01');
    expect(result.current.endDate).toBe('2024-12-31');
  });

  it('reads minRetries from URL', () => {
    setParams('minRetries=5');
    const { result } = renderHook(() => useDLQFilterState());
    expect(result.current.minRetries).toBe(5);
  });
});

describe('useDLQFilterState — setPage', () => {
  beforeEach(() => {
    mockPush.mockClear();
    setParams('');
  });

  it('pushes page param when page > 1', () => {
    const { result } = renderHook(() => useDLQFilterState());
    act(() => { result.current.setPage(3); });
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining('page=3'),
      expect.anything()
    );
  });

  it('omits page param when setPage(1) called', () => {
    setParams('page=5');
    const { result } = renderHook(() => useDLQFilterState());
    act(() => { result.current.setPage(1); });
    const calledUrl: string = mockPush.mock.calls[0][0];
    expect(calledUrl).not.toContain('page=');
  });

  it('does not reset other params when changing page', () => {
    setParams('status=all&startDate=2024-01-01');
    const { result } = renderHook(() => useDLQFilterState());
    act(() => { result.current.setPage(2); });
    const calledUrl: string = mockPush.mock.calls[0][0];
    expect(calledUrl).toContain('status=all');
    expect(calledUrl).toContain('startDate=2024-01-01');
  });
});

describe('useDLQFilterState — setStatusFilter', () => {
  beforeEach(() => {
    mockPush.mockClear();
    setParams('');
  });

  it('adds status=all to URL', () => {
    const { result } = renderHook(() => useDLQFilterState());
    act(() => { result.current.setStatusFilter('all'); });
    const calledUrl: string = mockPush.mock.calls[0][0];
    expect(calledUrl).toContain('status=all');
  });

  it('removes status param when set to "failed" (the default)', () => {
    setParams('status=all');
    const { result } = renderHook(() => useDLQFilterState());
    act(() => { result.current.setStatusFilter('failed'); });
    const calledUrl: string = mockPush.mock.calls[0][0];
    expect(calledUrl).not.toContain('status=');
  });

  it('resets page to 1', () => {
    setParams('page=3');
    const { result } = renderHook(() => useDLQFilterState());
    act(() => { result.current.setStatusFilter('all'); });
    const calledUrl: string = mockPush.mock.calls[0][0];
    expect(calledUrl).not.toContain('page=');
  });
});

describe('useDLQFilterState — setStartDate / setEndDate', () => {
  beforeEach(() => {
    mockPush.mockClear();
    setParams('');
  });

  it('setStartDate adds param to URL and resets page', () => {
    setParams('page=2');
    const { result } = renderHook(() => useDLQFilterState());
    act(() => { result.current.setStartDate('2024-03-01'); });
    const calledUrl: string = mockPush.mock.calls[0][0];
    expect(calledUrl).toContain('startDate=2024-03-01');
    expect(calledUrl).not.toContain('page=');
  });

  it('setStartDate with empty string removes the param', () => {
    setParams('startDate=2024-01-01');
    const { result } = renderHook(() => useDLQFilterState());
    act(() => { result.current.setStartDate(''); });
    const calledUrl: string = mockPush.mock.calls[0][0];
    expect(calledUrl).not.toContain('startDate=');
  });

  it('setEndDate adds param to URL and resets page', () => {
    setParams('page=2');
    const { result } = renderHook(() => useDLQFilterState());
    act(() => { result.current.setEndDate('2024-03-31'); });
    const calledUrl: string = mockPush.mock.calls[0][0];
    expect(calledUrl).toContain('endDate=2024-03-31');
    expect(calledUrl).not.toContain('page=');
  });

  it('setEndDate with empty string removes the param', () => {
    setParams('endDate=2024-12-31');
    const { result } = renderHook(() => useDLQFilterState());
    act(() => { result.current.setEndDate(''); });
    const calledUrl: string = mockPush.mock.calls[0][0];
    expect(calledUrl).not.toContain('endDate=');
  });
});

describe('useDLQFilterState — setMinRetries', () => {
  beforeEach(() => {
    mockPush.mockClear();
    setParams('');
  });

  it('adds minRetries param to URL and resets page', () => {
    setParams('page=2');
    const { result } = renderHook(() => useDLQFilterState());
    act(() => { result.current.setMinRetries(3); });
    const calledUrl: string = mockPush.mock.calls[0][0];
    expect(calledUrl).toContain('minRetries=3');
    expect(calledUrl).not.toContain('page=');
  });

  it('removes minRetries param when set to undefined', () => {
    setParams('minRetries=5');
    const { result } = renderHook(() => useDLQFilterState());
    act(() => { result.current.setMinRetries(undefined); });
    const calledUrl: string = mockPush.mock.calls[0][0];
    expect(calledUrl).not.toContain('minRetries=');
  });
});

describe('useDLQFilterState — param preservation', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('preserves all other params when updating one filter', () => {
    setParams('status=all&startDate=2024-01-01&minRetries=2');
    const { result } = renderHook(() => useDLQFilterState());
    act(() => { result.current.setEndDate('2024-12-31'); });
    const calledUrl: string = mockPush.mock.calls[0][0];
    expect(calledUrl).toContain('status=all');
    expect(calledUrl).toContain('startDate=2024-01-01');
    expect(calledUrl).toContain('minRetries=2');
    expect(calledUrl).toContain('endDate=2024-12-31');
  });

  it('uses scroll:false on all router.push calls', () => {
    setParams('');
    const { result } = renderHook(() => useDLQFilterState());
    act(() => { result.current.setPage(2); });
    expect(mockPush).toHaveBeenCalledWith(expect.any(String), { scroll: false });
  });
});
