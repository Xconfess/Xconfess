export interface ComparisonItem {
  id: string;
  type: 'confession';
  name: string;
  metrics: Record<string, number | string>;
  data: any; // Full confession data for display
}

export interface ComparisonRequest {
  itemIds: string[];
  metrics?: string[];
}

export interface ComparisonData {
  items: ComparisonItem[];
  metrics: string[];
}