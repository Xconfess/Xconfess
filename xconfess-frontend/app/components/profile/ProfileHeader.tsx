import React from "react";
import Image from "next/image";
import { UserProfile } from "../../api/user.api";

interface Props { profile: UserProfile; }

const ProfileHeader = ({ profile }: Props) => {
  return (
    <div className="flex flex-col lg:flex-row items-center gap-6">
      <Image
        src={profile.avatarUrl || "/default-avatar.png"}
        alt={profile.username}
        width={112}
        height={112}
        className="w-28 h-28 rounded-full object-cover shadow-lg"
      />
      <div>
        <h1 className="text-3xl font-bold">{profile.isAnonymous ? "Anonymous" : profile.username}</h1>
        <p className="text-gray-400 text-sm">Member of Xconfess</p>
      </div>
    </div>
  );
};

export default ProfileHeader;
