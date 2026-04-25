'use client';

import AnchorButton from './AnchorButton';

export default function ConfessionCard() {
  return (
    <div className="p-4 border rounded shadow-sm bg-white">
      <p className="text-gray-800">
        This is a sample confession.
      </p>

      <div className="mt-3">
        <AnchorButton />
      </div>
    </div>
  );
}