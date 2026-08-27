"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MessageSquare, Heart, DollarSign, Award, Clock, ExternalLink, Anchor } from "lucide-react";

type ActivityType =
  | "confession"
  | "reaction"
  | "tip_sent"
  | "tip_received"
  | "badge_earned";

interface ActivityItem {
  id: string;
  type: ActivityType;
  timestamp: string;
  data: any;
}

import { Confession } from "@/app/lib/types/confession";
import { getStellarExplorerUrl } from "@/app/lib/utils/stellar";

interface ActivityTimelineProps {
  userId: string;
}

export function ActivityTimeline({ userId }: ActivityTimelineProps) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [confessions, setConfessions] = useState<Confession[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [activeTab, setActiveTab] = useState<
    "all" | "confessions" | "reactions" | "tips"
  >("all");
  const observerTarget = useRef<HTMLDivElement>(null);

  const fetchActivities = useCallback(
    async (pageNum: number) => {
      if (loading) return;

      setLoading(true);
      try {
        // Fetch different data based on active tab
        if (activeTab === "confessions") {
          const response = await fetch(
            `/api/users/${userId}/confessions?page=${pageNum}&limit=10`
          );
          const data = await response.json();

          if (pageNum === 1) {
            setConfessions(data.confessions);
          } else {
            setConfessions((prev) => [...prev, ...data.confessions]);
          }

          setHasMore(pageNum < data.totalPages);
        } else {
          // Fetch general activities
          const response = await fetch(
            `/api/users/${userId}/activities?page=${pageNum}&limit=10&type=${activeTab}`
          );
          const data = await response.json();

          if (pageNum === 1) {
            setActivities(data.activities);
          } else {
            setActivities((prev) => [...prev, ...data.activities]);
          }

          setHasMore(data.hasMore);
        }
      } catch (error) {
        console.error("Error fetching activities:", error);
      } finally {
        setLoading(false);
      }
    },
    [userId, activeTab, loading]
  );

  useEffect(() => {
    setPage(1);
    setActivities([]);
    setConfessions([]);
    fetchActivities(1);
  }, [activeTab, fetchActivities]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          setPage((prev) => prev + 1);
          fetchActivities(page + 1);
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasMore, loading, page, fetchActivities]);

  const getActivityIcon = (type: ActivityType) => {
    switch (type) {
      case "confession":
        return <MessageSquare className="w-5 h-5" />;
      case "reaction":
        return <Heart className="w-5 h-5" />;
      case "tip_sent":
      case "tip_received":
        return <DollarSign className="w-5 h-5" />;
      case "badge_earned":
        return <Award className="w-5 h-5" />;
      default:
        return <Clock className="w-5 h-5" />;
    }
  };

  const getActivityColor = (type: ActivityType) => {
    switch (type) {
      case "confession":
        return "bg-blue-100 text-blue-700";
      case "reaction":
        return "bg-pink-100 text-pink-700";
      case "tip_sent":
        return "bg-yellow-100 text-yellow-700";
      case "tip_received":
        return "bg-green-100 text-green-700";
      case "badge_earned":
        return "bg-purple-100 text-purple-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInHours = diffInMs / (1000 * 60 * 60);

    if (diffInHours < 24) {
      const hours = Math.floor(diffInHours);
      return hours === 0 ? "Just now" : `${hours}h ago`;
    } else if (diffInHours < 168) {
      const days = Math.floor(diffInHours / 24);
      return `${days}d ago`;
    } else {
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Activity Timeline</h2>

        {/* Tab Filters */}
        <div className="flex gap-2">
          {(["all", "confessions", "reactions", "tips"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === tab
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-300"
                }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md">
        {/* Confessions View */}
        {activeTab === "confessions" && (
          <div className="divide-y divide-gray-200">
            {confessions.length === 0 && !loading ? (
              <div className="p-8 text-center text-gray-500">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                <p>No confessions yet</p>
              </div>
            ) : (
              confessions.map((confession) => (
                <div
                  key={confession.id}
                  className="p-6 hover:bg-gray-50 transition"
                >
                  <div className="flex items-start gap-4">
                    <div className="shrink-0 p-3 bg-blue-100 rounded-lg">
                      <MessageSquare className="w-5 h-5 text-blue-700" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded">
                          {confession.category}
                        </span>
                        {confession.isAnonymous && (
                          <span className="px-2 py-1 text-xs font-medium bg-purple-100 text-purple-700 rounded">
                            Anonymous
                          </span>
                        )}
                        <span className="text-sm text-gray-500">
                          {formatTimestamp(confession.createdAt)}
                        </span>
                      </div>

                      <p className="text-gray-800 mb-3 line-clamp-3">
                        {confession.content}
                      </p>

                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <span className="flex items-center gap-1">
                          <Heart className="w-4 h-4" />
                          {confession.reactionCount} reactions
                        </span>
                        <span>•</span>
                        <span>{confession.viewCount} views</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Activities View */}
        {activeTab !== "confessions" && (
          <div className="divide-y divide-gray-200">
            {activities.length === 0 && !loading ? (
              <div className="p-8 text-center text-gray-500">
                <Clock className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                <p>No activity yet</p>
              </div>
            ) : (
              activities.map((activity) => {
                const txHash =
                  activity.data?.txHash ||
                  activity.data?.stellarTxHash ||
                  activity.data?.transactionHash;
                const explorerUrl = txHash
                  ? getStellarExplorerUrl(txHash)
                  : null;

                return (
                <div
                  key={activity.id}
                  className="p-6 hover:bg-gray-50 transition"
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`shrink-0 p-3 rounded-lg ${getActivityColor(activity.type)}`}
                    >
                      {getActivityIcon(activity.type)}
                    </div>

                    <div className="flex-1">
                      <p className="text-gray-800 mb-1">
                        {activity.data.description || "Activity recorded"}
                      </p>
                      {explorerUrl && (
                        <a
                          href={explorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 mb-1 text-xs text-blue-600 hover:text-blue-800"
                        >
                          <ExternalLink className="h-3 w-3" />
                          View on Stellar Explorer
                        </a>
                      )}
                      <p className="text-sm text-gray-500">
                        {formatTimestamp(activity.timestamp)}
                      </p>
                    </div>
                  </div>
                </div>
                );
              })
            )}
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div role="status" aria-label="loading" className="p-6 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        )}

        {/* Intersection Observer Target */}
        <div ref={observerTarget} className="h-4" />
      </div>
    </div>
  );
}
