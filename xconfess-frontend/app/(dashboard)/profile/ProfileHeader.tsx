"xuse client";

import { UserCircle, Calendar, Award } from "lucide-react";
import Image from "next/image";

interface Badge {
  id: string;
  name: string;
  description: string;
  iconUrl?: string;
}

interface ProfileHeaderProps {
  username: string;
  isAnonymous: boolean;
  joinDate: string;
  badges: Badge[];
}

export function ProfileHeader({
  username,
  isAnonymous,
  joinDate,
  badges,
}: ProfileHeaderProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <header aria-label="Profile Header" className="bg-white rounded-lg shadow-md p-6">
      <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
        {/* Avatar */}
        <div className="shrink-0">
          <div className="w-24 h-24 bg-linear-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
            <UserCircle className="w-16 h-16 text-white" />
          </div>
        </div>

        {/* User Info */}
        <div className="flex-1 text-center md:text-left">
          <div className="flex flex-col md:flex-row md:items-center gap-2 mb-2">
            <h1 className="text-3xl font-bold text-gray-900">
              {isAnonymous ? "Anonymous User" : username}
            </h1>
            {isAnonymous && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                Anonymous Mode
              </span>
            )}
          </div>

          <div className="flex items-center justify-center md:justify-start gap-2 text-gray-600 mb-4">
            <Calendar className="w-4 h-4" />
            <span className="text-sm">Joined {formatDate(joinDate)}</span>
          </div>

          {/* Badge Showcase */}
          {badges && badges.length > 0 ? (
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-2">
                <Award className="w-5 h-5 text-yellow-600" />
                <h3 className="text-sm font-semibold text-gray-700">Badges</h3>
              </div>
              <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                {badges.map((badge) => (
                  <div
                    key={badge.id}
                    className="group relative inline-flex items-center gap-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg hover:bg-yellow-100 transition"
                    title={badge.description}
                  >
                    {badge.iconUrl ? (
                      <Image
                        src={badge.iconUrl}
                        alt={badge.name}
                        width={20}
                        height={20}
                        className="w-5 h-5"
                      />
                    ) : (
                      <Award className="w-5 h-5 text-yellow-600" />
                    )}
                    <span className="text-xs font-medium text-yellow-800">
                      {badge.name}
                    </span>

                    {/* Tooltip */}
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                      {badge.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center gap-2 text-gray-500">
                <Award className="w-5 h-5" />
                <p className="text-sm">
                  No badges earned yet. Keep engaging to earn badges!
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
