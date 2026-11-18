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
    <header aria-label="Profile Header" className="rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-6">
      <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
        {/* Avatar */}
        <div className="shrink-0">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-muted)]">
            <UserCircle className="h-9 w-9 text-[var(--secondary)]" />
          </div>
        </div>

        {/* User Info */}
        <div className="flex-1 text-center md:text-left">
          <div className="flex flex-col md:flex-row md:items-center gap-2 mb-2">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
              {isAnonymous ? "Anonymous User" : username}
            </h1>
            {isAnonymous && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-[var(--surface-muted)] text-[var(--secondary)]">
                Anonymous Mode
              </span>
            )}
          </div>

          <div className="flex items-center justify-center md:justify-start gap-2 text-[var(--secondary)] mb-4">
            <Calendar className="w-4 h-4" />
            <span className="text-sm">Joined {formatDate(joinDate)}</span>
          </div>

          {/* Badge Showcase */}
          {badges && badges.length > 0 ? (
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-2">
                <Award className="w-5 h-5 text-[var(--warning)]" />
                <h3 className="text-sm font-semibold text-[var(--secondary)]">Badges</h3>
              </div>
              <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                {badges.map((badge) => (
                  <div
                    key={badge.id}
                    className="group relative inline-flex items-center gap-2 px-3 py-2 bg-[var(--warning)]/10 border border-[var(--warning)]/30 rounded-lg hover:bg-[var(--warning)]/10 transition"
                    title={badge.description}
                  >
                    {badge.iconUrl ? (
                      <Image
                        src={badge.iconUrl}
                        alt=""
                        width={20}
                        height={20}
                        className="w-5 h-5"
                      />
                    ) : (
                      <Award className="w-5 h-5 text-[var(--warning)]" />
                    )}
                    <span className="text-xs font-medium text-[var(--foreground)]">
                      {badge.name}
                    </span>

                    {/* Tooltip */}
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-[var(--surface)] text-[var(--foreground)] text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                      {badge.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-4 p-4 bg-[var(--surface-muted)] rounded-lg border border-[var(--border)]">
              <div className="flex items-center gap-2 text-[var(--text-muted)]">
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
