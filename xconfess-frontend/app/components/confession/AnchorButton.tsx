'use client';

import { useState } from 'react';
import apiclient from '@/app/lib/api/client';

export default function AnchorButton() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAnchor = async () => {
    if (isSubmitting) return; // prevent duplicate clicks

    try {
      setIsSubmitting(true);
      await apiclient.post('/confessions/anchor', {});
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
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
      {isSubmitting ? 'Anchoring...' : 'Anchor'}
    </button>
  );
}