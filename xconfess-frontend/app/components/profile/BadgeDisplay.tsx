import React from "react";

interface Props { badges: string[]; }

const BadgeDisplay = ({ badges }: Props) => {
  return (
    <div className="flex flex-wrap gap-4">
      {badges.map((badge) => (
        <span
          key={badge}
          className="bg-[var(--warning)] text-[var(--foreground)] px-3 py-1 rounded-full text-sm font-semibold"
        >
          {badge}
        </span>
      ))}
    </div>
  );
};

export default BadgeDisplay;
