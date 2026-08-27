'use client';

import React from 'react';

interface SkeletonLoaderProps {
  count?: number;
  height?: string;
  width?: string;
  circle?: boolean;
  className?: string;
  lines?: number;
}

const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  count = 1,
  height = 'h-4',
  width = 'w-full',
  circle = false,
  className = '',
  lines = 3,
}) => {
  const items = Array.from({ length: count });

  if (circle) {
    return (
      <div className={`flex gap-4 ${className}`}>
        {items.map((_, i) => (
          <div
            key={i}
            className={`${height} ${height === 'h-4' ? 'w-4' : height.replace('h-', 'w-')} bg-zinc-700 rounded-full animate-pulse`}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={className}>
      {items.map((_, i) => (
        <div key={i} className="space-y-3 mb-6">
          {Array.from({ length: lines }).map((_, lineIndex) => (
            <div
              key={`${i}-${lineIndex}`}
              className={`
                ${width} ${height} bg-zinc-700 rounded
                animate-pulse
                ${lineIndex === lines - 1 ? 'w-5/6' : ''}
              `}
            />
          ))}
        </div>
      ))}
    </div>
  );
};

export const CardSkeleton: React.FC<{ count?: number }> = ({ count = 1 }) => {
  const items = Array.from({ length: count });

  return (
    <div className="space-y-4">
      {items.map((_, i) => (
        <div
          key={i}
          className="bg-zinc-800 rounded-lg p-6 space-y-4 animate-pulse"
        >
          <div className="h-6 bg-zinc-700 rounded w-2/3" />
          <div className="space-y-2">
            <div className="h-4 bg-zinc-700 rounded" />
            <div className="h-4 bg-zinc-700 rounded w-5/6" />
          </div>
          <div className="flex gap-4 pt-4">
            <div className="h-8 bg-zinc-700 rounded w-24" />
            <div className="h-8 bg-zinc-700 rounded w-24" />
          </div>
        </div>
      ))}
    </div>
  );
};

export const TableSkeleton: React.FC<{ rows?: number; cols?: number }> = ({
  rows = 5,
  cols = 4,
}) => {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: cols }).map((_, j) => (
            <div
              key={`${i}-${j}`}
              className="h-8 bg-zinc-700 rounded flex-1 animate-pulse"
            />
          ))}
        </div>
      ))}
    </div>
  );
};

export default SkeletonLoader;
