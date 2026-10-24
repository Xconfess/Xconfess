import React, { useState } from "react";
import { UserProfile } from "../../api/user.api";
import Link from "next/link";
import { Shield, Bell, ChevronRight } from "lucide-react";
import { useGlobalToast } from "@/app/components/common/Toast";

interface Props {
  profile: UserProfile;
  saveProfile: (data: Partial<UserProfile>) => Promise<void>;
}

const ProfileSettings = ({ profile, saveProfile }: Props) => {
  const [isAnonymous, setIsAnonymous] = useState(profile.isAnonymous);
  const toast = useGlobalToast();

  const handleSave = async () => {
    await saveProfile({ isAnonymous });
    toast.success("Profile updated!");
  };

  return (
    <div className="p-6 bg-[var(--surface-muted)] rounded space-y-4">
      <h2 className="text-xl font-semibold text-[var(--foreground)] mb-4">Settings</h2>

      {/* Profile Settings */}
      <div className="border border-[var(--border)] bg-[var(--surface-elevated)] rounded-lg p-4 space-y-4">
        <h3 className="font-semibold text-[var(--foreground)]">Profile Settings</h3>
        <label className="flex items-center gap-2 text-[var(--foreground)]">
          <input
            type="checkbox"
            checked={isAnonymous}
            onChange={(e) => setIsAnonymous(e.target.checked)}
            className="w-4 h-4 text-[var(--primary-deep)] bg-[var(--text-muted)] border-[var(--accent-border)] rounded focus:ring-[var(--focus-ring)]"
          />
          Stay Anonymous
        </label>
        <button
          onClick={handleSave}
          className="bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white px-4 py-2 rounded w-full"
        >
          Save Profile Settings
        </button>
      </div>

      {/* Quick Links to Other Settings */}
      <div className="space-y-2">
        <Link
          href="/settings/privacy"
          className="border border-[var(--border)] block bg-[var(--surface-elevated)] hover:bg-[var(--text-muted)] rounded-lg p-4 transition"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-[var(--primary-deep)]" />
              <div>
                <div className="font-medium text-[var(--foreground)]">Privacy & Safety</div>
                <div className="text-sm text-[var(--text-muted)]">
                  Visibility and consent controls
                </div>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-[var(--text-muted)]" />
          </div>
        </Link>

        <Link
          href="/settings/notifications"
          className="border border-[var(--border)] block bg-[var(--surface-elevated)] hover:bg-[var(--text-muted)] rounded-lg p-4 transition"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5 text-[var(--primary-deep)]" />
              <div>
                <div className="font-medium text-[var(--foreground)]">Notifications</div>
                <div className="text-sm text-[var(--text-muted)]">
                  Manage notification preferences
                </div>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-[var(--text-muted)]" />
          </div>
        </Link>
      </div>
    </div>
  );
};

export default ProfileSettings;
