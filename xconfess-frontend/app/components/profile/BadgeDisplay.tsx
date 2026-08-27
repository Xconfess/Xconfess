import React from "react";

interface Props { badges: string[]; }

const BadgeDisplay = ({ badges }: Props) => {
  return (
    <div className="flex flex-wrap gap-4">
      {badges.map((badge) => (
        <span
          key={badge}
          className="bg-yellow-500 text-black px-3 py-1 rounded-full text-sm font-semibold"
        >
          {badge}
        </span>
      ))}
    </div>
  );
};

export default BadgeDisplay;
