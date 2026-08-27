"use client";

import { useState, useEffect } from "react";
import { X, Info } from "lucide-react";

interface Props {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
  placement?: "top" | "bottom" | "left" | "right";
  showOnFirstVisit?: boolean;
}

export const FeatureTooltip = ({
  id,
  title,
  description,
  children,
  placement = "top",
  showOnFirstVisit = true,
}: Props) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    if (showOnFirstVisit) {
      const hasSeenKey = `tooltip-seen-${id}`;
      const hasSeen = localStorage.getItem(hasSeenKey);
      if (!hasSeen) {
        setIsVisible(true);
      }
    }
  }, [id, showOnFirstVisit]);

  const handleDismiss = () => {
    setIsVisible(false);
    setIsDismissed(true);
    localStorage.setItem(`tooltip-seen-${id}`, "true");
  };

  const handleToggle = () => {
    if (!isDismissed) setIsVisible(!isVisible);
  };
  const arrowClasses = {
    top: "bottom-[-6px] left-1/2 -translate-x-1/2",
    bottom: "top-[-6px] left-1/2 -translate-x-1/2",
    left: "right-[-6px] top-1/2 -translate-y-1/2",
    right: "left-[-6px] top-1/2 -translate-y-1/2",
  };

  const placementClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  return (
    <div className="relative inline-block">
      {/* Children element */}
      <div onClick={handleToggle} className="cursor-pointer">
        {children}
        <Info className="inline ml-1 w-4 h-4 text-gray-400" />
      </div>

      {/* Tooltip */}
      {isVisible && (
        <div
          className={`absolute z-50 ${placementClasses[placement]} w-64 bg-zinc-800 text-white p-3 rounded-lg shadow-lg`}
        >
          {/* Arrow */}
          <div
            className={`absolute w-3 h-3 bg-zinc-800 rotate-45 ${arrowClasses[placement]}`}
          />

          {/* Header */}
          <div className="flex justify-between items-center mb-2">
            <h4 className="font-semibold text-white">{title}</h4>
            <button
              onClick={handleDismiss}
              className="text-gray-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Description */}
          <p className="text-gray-300 text-sm">{description}</p>

          {/* Got it button */}
          <button
            onClick={handleDismiss}
            className="mt-2 w-full bg-purple-600 hover:bg-purple-700 text-white text-sm py-1 rounded-lg transition"
          >
            Got it!
          </button>
        </div>
      )}
    </div>
  );
};
