"use client";

import React, { useEffect, useState } from "react";
import { getConfessions } from "@/app/lib/api/confessions";
import type { NormalizedConfession } from "@/app/lib/utils/normalizeConfession";

interface Props {
  userId: string;
}

const ConfessionHistory = ({ userId }: Props) => {
  const [confessions, setConfessions] = useState<NormalizedConfession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      const result = await getConfessions({ page: 1, limit: 20, userId });
      if (result.ok) {
        setConfessions(result.data.confessions);
      }
      setLoading(false);
    };
    fetchHistory();
  }, [userId]);

  if (loading) return <p>Loading confessions...</p>;
  if (!confessions.length) return <p>No confessions yet.</p>;

  return (
    <div className="space-y-4">
      {confessions.map((confession) => (
        <div key={confession.id} className="p-4 bg-gray-800 rounded">
          {confession.content}
        </div>
      ))}
    </div>
  );
};

export default ConfessionHistory;
