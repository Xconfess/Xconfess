import React from "react";
import { useProfile } from "../lib/hooks/useProfile";
import ProfileHeader from "../components/profile/ProfileHeader";
import ProfileStats from "../components/profile/ProfileStats";
import ConfessionHistory from "../components/profile/ConfessionHistory";
import ProfileSettings from "../components/profile/ProfileSettings";
import BadgeDisplay from "../components/profile/BadgeDisplay";
import Loading from "../components/common/Loading";

const ProfilePage = () => {
  const { profile, stats, loading, error, saveProfile } = useProfile();

  if (loading) return <Loading />;
  if (error) return <p className="text-red-500 text-center mt-10">{error}</p>;
  if (!profile || !stats) return <p className="text-center mt-10">Profile not found</p>;

  return (
    <div className="container mx-auto px-6 py-12 space-y-10">
      <ProfileHeader profile={profile} />
      <ProfileStats stats={stats} />
      <BadgeDisplay badges={stats.badges} />
      <ConfessionHistory userId={profile.id} />
      <ProfileSettings profile={profile} saveProfile={saveProfile} />
    </div>
  );
};

export default ProfilePage;
