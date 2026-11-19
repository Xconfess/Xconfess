"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MessageSquare, Heart, DollarSign, Award, Clock, ExternalLink } from "lucide-react";

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
        return "bg-[var(--accent-soft)] text-[var(--primary-deep)]";
      case "reaction":
        return "bg-[var(--accent-soft)] text-[var(--primary-deep)]";
      case "tip_sent":
        return "bg-[var(--warning)]/10 text-[var(--warning)]";
      case "tip_received":
        return "bg-[var(--success)]/10 text-[var(--success)]";
      case "badge_earned":
        return "bg-[var(--accent-soft)] text-[var(--primary-deep)]";
      default:
        return "bg-[var(--surface-muted)] text-[var(--secondary)]";
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
        <h2 className="text-2xl font-semibold text-[var(--foreground)]">Activity Timeline</h2>

        {/* Tab Filters */}
        <div className="flex gap-2">
          {(["all", "confessions", "reactions", "tips"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === tab
                  ? "bg-[var(--primary)] text-white"
                  : "bg-[var(--surface)] text-[var(--secondary)] hover:bg-[var(--surface-muted)] border border-[var(--accent-border)]"
                }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-[var(--surface)] rounded-lg">
        {/* Confessions View */}
        {activeTab === "confessions" && (
          <div className="divide-y divide-[var(--border)]">
            {confessions.length === 0 && !loading ? (
              <div className="p-8 text-center text-[var(--text-muted)]">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 text-[var(--text-muted)]" />
                <p>No confessions yet</p>
              </div>
            ) : (
              confessions.map((confession) => (
                <div
                  key={confession.id}
                  className="p-6 hover:bg-[var(--surface-muted)] transition"
                >
                  <div className="flex items-start gap-4">
                    <div className="shrink-0 p-3 bg-[var(--accent-soft)] rounded-lg">
                      <MessageSquare className="w-5 h-5 text-[var(--primary-deep)]" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-2 py-1 text-xs font-medium bg-[var(--surface-muted)] text-[var(--secondary)] rounded">
                          {confession.category}
                        </span>
                        {confession.isAnonymous && (
                          <span className="px-2 py-1 text-xs font-medium bg-[var(--accent-soft)] text-[var(--primary-deep)] rounded">
                            Anonymous
                          </span>
                        )}
                        <span className="text-sm text-[var(--text-muted)]">
                          {formatTimestamp(confession.createdAt)}
                        </span>
                      </div>

                      <p className="text-[var(--foreground)] mb-3 line-clamp-3">
                        {confession.content}
                      </p>

                      <div className="flex items-center gap-4 text-sm text-[var(--secondary)]">
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
          <div className="divide-y divide-[var(--border)]">
            {activities.length === 0 && !loading ? (
              <div className="p-8 text-center text-[var(--text-muted)]">
                <Clock className="w-12 h-12 mx-auto mb-3 text-[var(--text-muted)]" />
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
                  className="p-6 hover:bg-[var(--surface-muted)] transition"
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`shrink-0 p-3 rounded-lg ${getActivityColor(activity.type)}`}
                    >
                      {getActivityIcon(activity.type)}
                    </div>

                    <div className="flex-1">
                      <p className="text-[var(--foreground)] mb-1">
                        {activity.data.description || "Activity recorded"}
                      </p>
                      {explorerUrl && (
                        <a
                          href={explorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 mb-1 text-xs text-[var(--primary-deep)] hover:text-[var(--primary-deep)]"
                        >
                          <ExternalLink className="h-3 w-3" />
                          View on Stellar Explorer
                        </a>
                      )}
                      <p className="text-sm text-[var(--text-muted)]">
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
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent-border)] mx-auto"></div>
          </div>
        )}

        {/* Intersection Observer Target */}
        <div ref={observerTarget} className="h-4" />
      </div>
    </div>
  );
}
