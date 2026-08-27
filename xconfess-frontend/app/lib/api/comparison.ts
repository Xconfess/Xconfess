import { useQuery } from '@tanstack/react-query';
import { apiClient } from './client';
import { queryKeys } from './queryKeys';
import { ComparisonData, ComparisonItem } from '../types/comparison';

export async function getComparisonData(itemIds: string[]): Promise<ComparisonData> {
  if (itemIds.length === 0) {
    return { items: [], metrics: [] };
  }

  // Fetch confessions by IDs
  const promises = itemIds.map(id =>
    apiClient.get(`/confessions/${id}`).then(res => res.data)
  );

  const confessions = await Promise.all(promises);

  // Define metrics to compare
  const metrics = ['reactionCount', 'commentCount', 'viewCount', 'createdAt'];

  const items: ComparisonItem[] = confessions.map(confession => ({
    id: confession.id,
    type: 'confession',
    name: confession.content.substring(0, 50) + '...', // Truncated content as name
    metrics: {
      reactionCount: confession.reactionCount || 0,
      commentCount: confession.commentCount || 0,
      viewCount: confession.viewCount || 0,
      createdAt: new Date(confession.createdAt).toLocaleDateString(),
    },
    data: confession,
  }));

  return { items, metrics };
}

export function useComparison(itemIds: string[]) {
  return useQuery({
    queryKey: queryKeys.comparison.list(itemIds),
    queryFn: () => getComparisonData(itemIds),
    enabled: itemIds.length > 0,
  });
}