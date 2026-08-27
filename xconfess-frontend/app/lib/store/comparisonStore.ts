import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ComparisonState {
  selectedIds: string[];
  maxItems: number;
  addItem: (id: string) => void;
  removeItem: (id: string) => void;
  clearItems: () => void;
  isSelected: (id: string) => boolean;
}

export const useComparisonStore = create<ComparisonState>()(
  persist(
    (set, get) => ({
      selectedIds: [],
      maxItems: 3,
      addItem: (id: string) => {
        const { selectedIds, maxItems } = get();
        if (selectedIds.length >= maxItems || selectedIds.includes(id)) {
          return;
        }
        set({ selectedIds: [...selectedIds, id] });
      },
      removeItem: (id: string) => {
        const { selectedIds } = get();
        set({ selectedIds: selectedIds.filter(itemId => itemId !== id) });
      },
      clearItems: () => set({ selectedIds: [] }),
      isSelected: (id: string) => get().selectedIds.includes(id),
    }),
    {
      name: 'comparison-storage',
    }
  )
);