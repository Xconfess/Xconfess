import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ChainActivity } from "../types/activity";

interface ActivityState {
  activities: ChainActivity[];

  addActivity: (activity: ChainActivity) => void;
  updateActivity: (id: string, updates: Partial<ChainActivity>) => void;
  clearResolved: () => void;
}

const localStoragePersist = {
  getItem: (name: string) => {
    const value = localStorage.getItem(name);
    return value ? JSON.parse(value) : null;
  },
  setItem: (name: string, value: any) => {
    localStorage.setItem(name, JSON.stringify(value));
  },
  removeItem: (name: string) => {
    localStorage.removeItem(name);
  },
};

export const useActivityStore = create<ActivityState>()(
  persist(
    (set) => ({
      activities: [],

      addActivity: (activity) =>
        set((state) => ({
          activities: [activity, ...state.activities],
        })),

      updateActivity: (id, updates) =>
        set((state) => ({
          activities: state.activities.map((a) =>
            a.id === id ? { ...a, ...updates, updatedAt: Date.now() } : a
          ),
        })),

      clearResolved: () =>
        set((state) => ({
          activities: state.activities.filter(
            (a) => a.status === "requested" || a.status === "submitted",
          ),
        })),
    }),
    {
      name: "chain-activity-storage",
      storage: localStoragePersist, // ✅ correctly typed
    }
  )
);