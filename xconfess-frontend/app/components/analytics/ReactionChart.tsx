"use client";

import { ReactionDistribution } from "@/app/lib/types/analytics.types";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";
import { Heart, ThumbsUp } from "lucide-react";

interface Props {
  data: ReactionDistribution[];
}

export const ReactionChart = ({ data }: Props) => {
  const COLORS = {
    like: "#3b82f6",
    love: "#ec4899",
  };

  const chartData = data.map((item) => ({
    name: item.type === "like" ? "Likes" : "Loves",
    value: item.count,
    percentage: item.percentage,
  }));

  return (
    <div className="bg-[var(--surface)] rounded-xl p-6 border border-[var(--border)]">
      <h3 className="text-xl font-semibold mb-6">Reaction Distribution</h3>

      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={(props) => {
              const total = chartData.reduce(
                (sum, item) => sum + item.value,
                0,
              );
              const percent = Math.round((props.value / total) * 100);
              return `${percent}%`;
            }}
            outerRadius={100}
            fill="#8884d8"
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.name === "Likes" ? COLORS.like : COLORS.love}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "#18181b",
              border: "1px solid #27272a",
              borderRadius: "8px",
              color: "#ffffff",
            }}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mt-6">
        {data.map((item) => (
          <div key={item.type} className="bg-[var(--surface-muted)] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              {item.type === "like" ? (
                <ThumbsUp className="w-5 h-5 text-[var(--primary-deep)]" />
              ) : (
                <Heart className="w-5 h-5 text-[var(--primary-deep)]" />
              )}
              <span className="text-[var(--text-muted)] capitalize">{item.type}s</span>
            </div>
            <div className="text-2xl font-semibold text-[var(--foreground)]">{item.count}</div>
            <div className="text-sm text-[var(--text-muted)]">
              {item.percentage}% of total
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
