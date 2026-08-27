import React from 'react';

export const Table = ({ children }: { children: React.ReactNode }) => (
  <div className="w-full overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl">
    <table className="min-w-full divide-y divide-zinc-800">{children}</table>
  </div>
);

export const THead = ({ children }: { children: React.ReactNode }) => (
  <thead className="bg-zinc-900/50">{children}</thead>
);

export const TBody = ({ children }: { children: React.ReactNode }) => (
  <tbody className="divide-y divide-zinc-900 bg-transparent">{children}</tbody>
);

export const Th = ({ children }: { children: React.ReactNode }) => (
  <th className="px-6 py-4 text-left text-xs font-semibold text-zinc-400 uppercase tracking-widest">
    {children}
  </th>
);