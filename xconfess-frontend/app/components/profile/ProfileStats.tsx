import React from "react";
import { UserStats } from "../../api/user.api";

interface Props { stats: UserStats; }
const ProfileStats = ({ stats }: Props) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      <div className="p-4 bg-gray-800 rounded shadow text-center">
        <h2 className="font-bold text-lg">{stats.totalConfessions}</h2>
        <p className="text-gray-400 text-sm">Confessions Posted</p>
      </div>
      <div className="p-4 bg-gray-800 rounded shadow text-center">
        <h2 className="font-bold text-lg">{stats.totalReactions}</h2>
        <p className="text-gray-400 text-sm">Reactions Received</p>
      </div>
      <div className="p-4 bg-gray-800 rounded shadow text-center">
        <h2 className="font-bold text-lg">{stats.mostPopularConfession}</h2>
        <p className="text-gray-400 text-sm">Most Popular Confession</p>
      </div>
      <div className="p-4 bg-gray-800 rounded shadow text-center">
        <h2 className="font-bold text-lg">{stats.streak} 🔥</h2>
        <p className="text-gray-400 text-sm">Activity Streak</p>
      </div>
    </div>
  );
};

export default ProfileStats;
