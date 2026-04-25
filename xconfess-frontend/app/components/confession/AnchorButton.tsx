'use client';

import { useState } from 'react';
import apiclient from '@/app/lib/api/client';

export default function AnchorButton() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleAnchor = async () => {
    if (isSubmitting) return; // 🚫 prevent duplicate clicks

    try {
      setIsSubmitting(true);

      await apiclient.post('/confessions/anchor', {
        dummy: true,
      });

      setStatus('success');
    } catch (err) {
      console.error(err);
      setStatus('error');
    } finally {
      setIsSubmitting(false); //  allows retry
    }
  };

  return (
    <button
      onClick={handleAnchor}
      disabled={isSubmitting}
      className={`px-4 py-2 rounded text-white ${
        isSubmitting
          ? 'bg-gray-400 cursor-not-allowed'
          : 'bg-blue-600 hover:bg-blue-700'
      }`}
    >
      {isSubmitting
        ? 'Anchoring...'
        : status === 'success'
        ? 'Anchored ✅'
        : status === 'error'
        ? 'Retry ❌'
        : 'Anchor'}
    </button>
  );
}