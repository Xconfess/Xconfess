"use client";

import { useState, useEffect } from "react";
import { ToggleLeft, Plus, Trash2, RotateCcw } from "lucide-react";

interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  percentage: number;
  userIds: string[];
  lastChangedBy?: string | null;
  lastChangedAt?: string | null;
  updatedAt?: string | null;
  rollbackMetadata?: {
    previousState?: Partial<FeatureFlag>;
    timestamp?: string;
  } | null;
}

export default function FeatureFlagsPage() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newFlag, setNewFlag] = useState({
    name: "",
    description: "",
    enabled: false,
    percentage: 0,
    userIds: [] as string[],
  });

  useEffect(() => {
    fetchFlags();
  }, []);

  const fetchFlags = async () => {
    try {
      const res = await fetch("/api/feature-flags", {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setFlags(data);
      }
    } catch (error) {
      console.error("Failed to fetch flags:", error);
    } finally {
      setLoading(false);
    }
  };

  const createFlag = async () => {
    try {
      const res = await fetch("/api/feature-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(newFlag),
      });

      if (res.ok) {
        await fetchFlags();
        setShowCreate(false);
        setNewFlag({
          name: "",
          description: "",
          enabled: false,
          percentage: 0,
          userIds: [],
        });
      }
    } catch (error) {
      console.error("Failed to create flag:", error);
    }
  };

  const updateFlag = async (name: string, updates: Partial<FeatureFlag>) => {
    try {
      const res = await fetch(`/api/feature-flags/${name}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });

      if (res.ok) {
        await fetchFlags();
      }
    } catch (error) {
      console.error("Failed to update flag:", error);
    }
  };

  const rollbackFlag = async (name: string) => {
    try {
      const res = await fetch(`/api/feature-flags/${name}/rollback`, {
        method: "POST",
        credentials: "include",
      });

      if (res.ok) {
        await fetchFlags();
      } else {
        const data = await res.json();
        alert(data.message || data.error || "Failed to rollback flag");
      }
    } catch (error) {
      console.error("Failed to rollback flag:", error);
    }
  };

  const deleteFlag = async (name: string) => {
    if (!confirm(`Delete feature flag "${name}"?`)) return;

    try {
      const res = await fetch(`/api/feature-flags/${name}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (res.ok) {
        await fetchFlags();
      }
    } catch (error) {
      console.error("Failed to delete flag:", error);
    }
  };

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Feature Flags</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          Create Flag
        </button>
      </div>

      {showCreate && (
        <div className="mb-6 p-6 border rounded-lg bg-gray-50 dark:bg-gray-800">
          <h3 className="text-lg font-semibold mb-4">
            Create New Feature Flag
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <input
                type="text"
                value={newFlag.name}
                onChange={(e) =>
                  setNewFlag({ ...newFlag, name: e.target.value })
                }
                placeholder="tipping"
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Description
              </label>
              <input
                type="text"
                value={newFlag.description}
                onChange={(e) =>
                  setNewFlag({ ...newFlag, description: e.target.value })
                }
                placeholder="Enable tipping feature"
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={newFlag.enabled}
                  onChange={(e) =>
                    setNewFlag({ ...newFlag, enabled: e.target.checked })
                  }
                  className="w-4 h-4"
                />
                <span>Enabled</span>
              </label>
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1">
                  Percentage: {newFlag.percentage}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={newFlag.percentage}
                  onChange={(e) =>
                    setNewFlag({
                      ...newFlag,
                      percentage: parseInt(e.target.value),
                    })
                  }
                  className="w-full"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={createFlag}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Create
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 bg-gray-300 dark:bg-gray-600 rounded-md"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {flags.map((flag) => (
          <div
            key={flag.id}
            className="p-6 border rounded-lg bg-white dark:bg-gray-900 space-y-4"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold">{flag.name}</h3>
                <p className="text-sm text-gray-500">{flag.description}</p>
              </div>
              <button
                onClick={() => deleteFlag(flag.name)}
                className="p-2 text-red-600 hover:bg-red-50 rounded-md"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={flag.enabled}
                    onChange={(e) =>
                      updateFlag(flag.name, { enabled: e.target.checked })
                    }
                    className="w-4 h-4"
                  />
                  <span className="font-medium">Enabled</span>
                </label>
                <span
                  className={`px-2 py-1 text-xs rounded-full ${
                    flag.enabled
                      ? "bg-green-100 text-green-800"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {flag.enabled ? "Active" : "Inactive"}
                </span>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium">
                    Rollout Percentage
                  </label>
                  <span className="text-sm font-mono">{flag.percentage}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={flag.percentage}
                  onChange={(e) =>
                    updateFlag(flag.name, {
                      percentage: parseInt(e.target.value),
                    })
                  }
                  className="w-full"
                />
              </div>

              <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-100 dark:border-gray-800">
                <div>
                  <span>Last changed by: </span>
                  <span className="font-semibold text-gray-700 dark:text-gray-300">
                    {flag.lastChangedBy || "System"}
                  </span>
                  {" at "}
                  <span>
                    {flag.lastChangedAt
                      ? new Date(flag.lastChangedAt).toLocaleString()
                      : flag.updatedAt
                      ? new Date(flag.updatedAt).toLocaleString()
                      : "N/A"}
                  </span>
                </div>
                {flag.rollbackMetadata?.previousState && (
                  <button
                    onClick={() => rollbackFlag(flag.name)}
                    className="flex items-center gap-1 text-amber-600 hover:text-amber-700 text-xs font-medium"
                    title="Rollback to previous state"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Rollback
                  </button>
                )}
              </div>

              <div className="text-xs text-gray-500">
                Test URL:{" "}
                <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                  ?ff_{flag.name}=true
                </code>
              </div>
            </div>
          </div>
        ))}

        {flags.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <ToggleLeft className="w-12 h-12 mx-auto mb-4" />
            <p>No feature flags yet. Create your first flag to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}
