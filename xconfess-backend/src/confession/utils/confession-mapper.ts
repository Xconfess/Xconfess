export interface SlimConfession {
  id: string;
  message: string;
  gender: string | null;
  created_at: Date;
  view_count: number;
  isAnchored: boolean;
  stellarTxHash: string | null;
  reactions: Array<{ type: string; count: number }>;
}

export function aggregateReactions(reactions: any[]): Array<{ type: string; count: number }> {
  if (!reactions || !Array.isArray(reactions)) {
    return [];
  }
  const counts: Record<string, number> = {};
  for (const r of reactions) {
    let type = 'like';
    const emoji = (r.emoji ?? '').toLowerCase();
    if (emoji === '👍' || emoji.includes('like')) {
      type = 'like';
    } else if (emoji === '❤️' || emoji.includes('love')) {
      type = 'love';
    } else {
      type = emoji || 'like';
    }
    counts[type] = (counts[type] ?? 0) + 1;
  }
  return Object.keys(counts).map((type) => ({
    type,
    count: counts[type],
  }));
}

export function mapToSlimConfession(confession: any): SlimConfession {
  if (!confession) return confession;
  return {
    id: confession.id,
    message: confession.message,
    gender: confession.gender ?? null,
    created_at: confession.created_at,
    view_count: confession.view_count ?? 0,
    isAnchored: confession.isAnchored ?? false,
    stellarTxHash: confession.stellarTxHash ?? null,
    reactions: aggregateReactions(confession.reactions),
  };
}
