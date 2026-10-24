import React from 'react';

export const Table = ({ children }: { children: React.ReactNode }) => (
  <div className="w-full overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--background)]">
    <table className="min-w-full divide-y divide-[var(--border)]">{children}</table>
  </div>
);

export const THead = ({ children }: { children: React.ReactNode }) => (
  <thead className="bg-[var(--surface)]/50">{children}</thead>
);

export const TBody = ({ children }: { children: React.ReactNode }) => (
  <tbody className="divide-y divide-[var(--border)] bg-transparent">{children}</tbody>
);

export const Th = ({ children }: { children: React.ReactNode }) => (
  <th className="px-6 py-4 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
    {children}
  </th>
);