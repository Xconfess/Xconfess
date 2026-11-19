import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ReportDetail from '../ReportDetail';
import { adminApi } from '@/app/lib/api/admin';
import type { Report } from '@/app/lib/api/admin';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockToast = { success: jest.fn(), error: jest.fn() };

jest.mock('@/app/components/common/Toast', () => ({
  useGlobalToast: () => mockToast,
}));

jest.mock('@/app/lib/api/admin', () => ({
  adminApi: {
    resolveReport: jest.fn(),
    dismissReport: jest.fn(),
    deleteConfession: jest.fn(),
    hideConfession: jest.fn(),
    getAuditLogs: jest.fn().mockResolvedValue({ logs: [] }),
  },
}));

jest.mock('@/app/components/admin/ReportModerationTimeline', () => ({
  ReportModerationTimeline: () => null,
  buildReportModerationTimeline: () => [],
}));

jest.mock('@/app/lib/utils/moderationTemplates', () => ({
  MODERATION_TEMPLATES: { report_resolved: [], report_dismissed: [] },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockReport: Report = {
  id: 'report-1',
  confessionId: 'confession-1',
  reporterId: null,
  type: 'spam',
  reason: 'Test spam reason',
  status: 'pending',
  resolvedBy: null,
  resolvedAt: null,
  resolutionNotes: null,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

function renderDetail(props: Partial<React.ComponentProps<typeof ReportDetail>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const onBack = jest.fn();
  const onActionSuccess = jest.fn();
  const utils = render(
    <QueryClientProvider client={qc}>
      <ReportDetail
        report={mockReport}
        onBack={onBack}
        onActionSuccess={onActionSuccess}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { ...utils, onBack, onActionSuccess };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  (adminApi.getAuditLogs as jest.Mock).mockResolvedValue({ logs: [] });
});

describe('ReportDetail — confession content states', () => {
  it('renders the confession content and reason for a reported confession', () => {
    renderDetail({
      report: {
        ...mockReport,
        confession: {
          id: 'confession-1',
          message: 'This is the reported confession text.',
          created_at: '2024-01-01T00:00:00Z',
        },
      },
    });

    expect(screen.getByText('This is the reported confession text.')).toBeInTheDocument();
    expect(screen.getByText('Test spam reason')).toBeInTheDocument();
  });

  it('shows a fallback message when confession content is missing', () => {
    renderDetail({ report: { ...mockReport, confession: undefined } });

    expect(screen.getByText('Confession not available')).toBeInTheDocument();
  });

  it('shows a deleted-confession notice when the confession has been deleted', () => {
    renderDetail({
      report: {
        ...mockReport,
        confession: {
          id: 'confession-1',
          message: 'Content preserved for moderation context.',
          created_at: '2024-01-01T00:00:00Z',
          isDeleted: true,
        },
      },
    });

    expect(screen.getByText(/this confession has been deleted/i)).toBeInTheDocument();
    expect(screen.getByText('Content preserved for moderation context.')).toBeInTheDocument();
  });

  it('shows a hidden-confession notice when the confession is hidden but not deleted', () => {
    renderDetail({
      report: {
        ...mockReport,
        confession: {
          id: 'confession-1',
          message: 'Still visible to moderators.',
          created_at: '2024-01-01T00:00:00Z',
          isHidden: true,
        },
      },
    });

    expect(screen.getByText(/currently hidden from other users/i)).toBeInTheDocument();
  });

  it('renders confession message and reason as inert text without executing embedded markup', () => {
    const { container } = renderDetail({
      report: {
        ...mockReport,
        reason: '<img src=x onerror=alert(1)>',
        confession: {
          id: 'confession-1',
          message: '<script>window.__xss = true;</script>Hello',
          created_at: '2024-01-01T00:00:00Z',
        },
      },
    });

    expect(container.querySelector('script')).not.toBeInTheDocument();
    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(screen.getByText(/<script>window\.__xss = true;<\/script>Hello/)).toBeInTheDocument();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
  });
});

describe('ReportDetail — resolve flow', () => {
  it('opens the resolve confirmation dialog when Resolve Report is clicked', async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByRole('button', { name: /resolve report/i }));

    expect(screen.getByText('Resolve report?')).toBeInTheDocument();
  });

  it('shows loading state on the confirm button while the resolve request is in-flight', async () => {
    let settle!: () => void;
    const pending = new Promise<{ id: string }>((res) => {
      settle = () => res({ id: 'report-1' });
    });
    (adminApi.resolveReport as jest.Mock).mockReturnValue(pending);

    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByRole('button', { name: /resolve report/i }));
    await user.click(screen.getByRole('button', { name: /^resolve$/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /processing/i })).toBeDisabled();
    });

    settle();
  });

  it('calls onActionSuccess and shows success toast after resolve completes', async () => {
    (adminApi.resolveReport as jest.Mock).mockResolvedValue({});

    const user = userEvent.setup();
    const { onActionSuccess } = renderDetail();

    await user.click(screen.getByRole('button', { name: /resolve report/i }));
    await user.click(screen.getByRole('button', { name: /^resolve$/i }));

    await waitFor(() => expect(onActionSuccess).toHaveBeenCalledTimes(1));
    expect(mockToast.success).toHaveBeenCalledWith('Report resolved.', undefined);
  });

  it('shows an error toast and does not call onActionSuccess when resolve fails', async () => {
    (adminApi.resolveReport as jest.Mock).mockRejectedValue(new Error('Network error'));

    const user = userEvent.setup();
    const { onActionSuccess } = renderDetail();

    await user.click(screen.getByRole('button', { name: /resolve report/i }));
    await user.click(screen.getByRole('button', { name: /^resolve$/i }));

    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('Failed to resolve report', undefined));
    expect(onActionSuccess).not.toHaveBeenCalled();
  });

  it('closes the dialog after a successful resolve', async () => {
    (adminApi.resolveReport as jest.Mock).mockResolvedValue({});

    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByRole('button', { name: /resolve report/i }));
    expect(screen.getByText('Resolve report?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^resolve$/i }));

    await waitFor(() => {
      expect(screen.queryByText('Resolve report?')).not.toBeInTheDocument();
    });
  });
});

describe('ReportDetail — dismiss flow', () => {
  it('opens the dismiss confirmation dialog when Dismiss Report is clicked', async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByRole('button', { name: /dismiss report/i }));

    expect(screen.getByText('Dismiss report?')).toBeInTheDocument();
  });

  it('shows loading state on the confirm button while the dismiss request is in-flight', async () => {
    let settle!: () => void;
    const pending = new Promise<{ id: string }>((res) => {
      settle = () => res({ id: 'report-1' });
    });
    (adminApi.dismissReport as jest.Mock).mockReturnValue(pending);

    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByRole('button', { name: /dismiss report/i }));
    await user.click(screen.getByRole('button', { name: /^dismiss$/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /processing/i })).toBeDisabled();
    });

    settle();
  });

  it('calls onActionSuccess and shows success toast after dismiss completes', async () => {
    (adminApi.dismissReport as jest.Mock).mockResolvedValue({});

    const user = userEvent.setup();
    const { onActionSuccess } = renderDetail();

    await user.click(screen.getByRole('button', { name: /dismiss report/i }));
    await user.click(screen.getByRole('button', { name: /^dismiss$/i }));

    await waitFor(() => expect(onActionSuccess).toHaveBeenCalledTimes(1));
    expect(mockToast.success).toHaveBeenCalledWith('Report dismissed.', undefined);
  });

  it('shows an error toast and does not call onActionSuccess when dismiss fails', async () => {
    (adminApi.dismissReport as jest.Mock).mockRejectedValue(new Error('Network error'));

    const user = userEvent.setup();
    const { onActionSuccess } = renderDetail();

    await user.click(screen.getByRole('button', { name: /dismiss report/i }));
    await user.click(screen.getByRole('button', { name: /^dismiss$/i }));

    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('Failed to dismiss report', undefined));
    expect(onActionSuccess).not.toHaveBeenCalled();
  });

  it('closes the dialog after a successful dismiss', async () => {
    (adminApi.dismissReport as jest.Mock).mockResolvedValue({});

    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByRole('button', { name: /dismiss report/i }));
    expect(screen.getByText('Dismiss report?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^dismiss$/i }));

    await waitFor(() => {
      expect(screen.queryByText('Dismiss report?')).not.toBeInTheDocument();
    });
  });
});

describe('ReportDetail — dialog cancel', () => {
  it('closes the dialog without calling any API when Cancel is clicked', async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByRole('button', { name: /resolve report/i }));
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.queryByText('Resolve report?')).not.toBeInTheDocument();
    expect(adminApi.resolveReport).not.toHaveBeenCalled();
  });
});

describe('ReportDetail — destructive action confirmations', () => {
  it('explains what happens before a confession is deleted', async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByRole('button', { name: /delete confession/i }));

    expect(screen.getByText('Delete confession?')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Permanently delete the reported confession. This removes the content for every user.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'The confession and its comments are permanently removed for everyone.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('This cannot be undone — the content cannot be restored.'),
    ).toBeInTheDocument();
  });

  it('deletes the confession only after the confirmation is accepted', async () => {
    (adminApi.deleteConfession as jest.Mock).mockResolvedValue({});

    const user = userEvent.setup();
    const { onBack } = renderDetail();

    await user.click(screen.getByRole('button', { name: /delete confession/i }));
    expect(adminApi.deleteConfession).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /^delete$/i }));

    await waitFor(() =>
      expect(adminApi.deleteConfession).toHaveBeenCalledWith(
        'confession-1',
        'Deleted via report resolution',
      ),
    );
    expect(mockToast.success).toHaveBeenCalledWith(
      'Confession deleted successfully',
      undefined,
    );
    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
  });

  it('does not delete the confession when the confirmation is dismissed', async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByRole('button', { name: /delete confession/i }));
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(adminApi.deleteConfession).not.toHaveBeenCalled();
    expect(screen.queryByText('Delete confession?')).not.toBeInTheDocument();
  });

  it('explains what happens before a confession is hidden', async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByRole('button', { name: /hide confession/i }));

    expect(screen.getByText('Hide confession?')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Hide the reported confession from the public feed. Moderators keep access to it.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'The confession disappears from the feed and from search results.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('It is kept for moderators and can be restored later.'),
    ).toBeInTheDocument();
  });

  it('hides the confession only after the confirmation is accepted', async () => {
    (adminApi.hideConfession as jest.Mock).mockResolvedValue({});

    const user = userEvent.setup();
    const { onBack } = renderDetail();

    await user.click(screen.getByRole('button', { name: /hide confession/i }));
    expect(adminApi.hideConfession).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /^hide$/i }));

    await waitFor(() =>
      expect(adminApi.hideConfession).toHaveBeenCalledWith(
        'confession-1',
        'Hidden via report resolution',
      ),
    );
    expect(mockToast.success).toHaveBeenCalledWith(
      'Confession hidden successfully',
      undefined,
    );
    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
  });

  it('does not hide the confession when the confirmation is dismissed', async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByRole('button', { name: /hide confession/i }));
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(adminApi.hideConfession).not.toHaveBeenCalled();
    expect(screen.queryByText('Hide confession?')).not.toBeInTheDocument();
  });

  it('lists the consequences of resolving a report', async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByRole('button', { name: /resolve report/i }));

    expect(
      screen.getByText('The report is closed and leaves the pending queue.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Your moderation notes are saved to the audit log.'),
    ).toBeInTheDocument();
  });

  it('lists the consequences of dismissing a report', async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByRole('button', { name: /dismiss report/i }));

    expect(
      screen.getByText('The report is closed and leaves the pending queue.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('The reported confession stays visible and unchanged.'),
    ).toBeInTheDocument();
  });

  it('cancels a destructive confirmation with the keyboard without running the action', async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByRole('button', { name: /delete confession/i }));
    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(screen.queryByText('Delete confession?')).not.toBeInTheDocument(),
    );
    expect(adminApi.deleteConfession).not.toHaveBeenCalled();
  });
});
