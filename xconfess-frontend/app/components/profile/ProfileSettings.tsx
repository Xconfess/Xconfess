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
    <div className="p-6 bg-gray-800 rounded space-y-4">
      <h2 className="text-xl font-bold text-white mb-4">Settings</h2>

      {/* Profile Settings */}
      <div className="bg-gray-700 rounded-lg p-4 space-y-4">
        <h3 className="font-semibold text-white">Profile Settings</h3>
        <label className="flex items-center gap-2 text-white">
          <input
            type="checkbox"
            checked={isAnonymous}
            onChange={(e) => setIsAnonymous(e.target.checked)}
            className="w-4 h-4 text-blue-600 bg-gray-600 border-gray-500 rounded focus:ring-blue-500"
          />
          Stay Anonymous
        </label>
        <button
          onClick={handleSave}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded w-full"
        >
          Save Profile Settings
        </button>
      </div>

      {/* Quick Links to Other Settings */}
      <div className="space-y-2">
        <Link
          href="/settings/privacy"
          className="block bg-gray-700 hover:bg-gray-600 rounded-lg p-4 transition"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-blue-400" />
              <div>
                <div className="font-medium text-white">Privacy & Safety</div>
                <div className="text-sm text-gray-400">
                  Visibility and consent controls
                </div>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-gray-400" />
          </div>
        </Link>

        <Link
          href="/settings/notifications"
          className="block bg-gray-700 hover:bg-gray-600 rounded-lg p-4 transition"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5 text-blue-400" />
              <div>
                <div className="font-medium text-white">Notifications</div>
                <div className="text-sm text-gray-400">
                  Manage notification preferences
                </div>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-gray-400" />
          </div>
        </Link>
      </div>
    </div>
  );
};

export default ProfileSettings;
