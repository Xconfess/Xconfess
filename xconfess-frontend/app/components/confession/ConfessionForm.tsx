'use client';

import { useState } from 'react';
import AnchorButton from './AnchorButton';

export default function ConfessionForm() {
  const [text, setText] = useState('');

  return (
    <div className="space-y-4">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write your confession..."
        className="w-full p-2 border rounded"
      />

      <AnchorButton />
    </div>
  );
}