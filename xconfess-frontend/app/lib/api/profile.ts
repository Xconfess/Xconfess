// lib/api/profile.ts

import {
  ActivityItem,
  PaginatedConfessions,
  ReactionHistoryItem,
  TipHistoryItem,
  UserProfile,
  UserStatistics,
} from "@/app/types/profile";
import apiClient from "./client";

class ProfileAPIClient {
  async getUserProfile(userId: string): Promise<UserProfile> {
    const response = await apiClient.get<UserProfile>(`/users/${userId}/profile`);
    return response.data;
  }

  async getUserStatistics(userId: string): Promise<UserStatistics> {
    const response = await apiClient.get<UserStatistics>(`/users/${userId}/statistics`);
    return response.data;
  }

  async getUserConfessions(
    userId: string,
    page: number = 1,
    limit: number = 10
  ): Promise<PaginatedConfessions> {
    const response = await apiClient.get<PaginatedConfessions>(
      `/users/${userId}/confessions?page=${page}&limit=${limit}`
    );
    return response.data;
  }

  async getUserReactions(userId: string): Promise<ReactionHistoryItem[]> {
    const response = await apiClient.get<ReactionHistoryItem[]>(`/users/${userId}/reactions`);
    return response.data;
  }

  async getUserTips(userId: string): Promise<TipHistoryItem[]> {
    const response = await apiClient.get<TipHistoryItem[]>(`/users/${userId}/tips`);
    return response.data;
  }

  async getUserActivities(
    userId: string,
    page: number = 1,
    limit: number = 10,
    type?: string
  ): Promise<{ activities: ActivityItem[]; hasMore: boolean }> {
    const typeParam = type && type !== "all" ? `&type=${type}` : "";
    const response = await apiClient.get<{ activities: ActivityItem[]; hasMore: boolean }>(
      `/users/${userId}/activities?page=${page}&limit=${limit}${typeParam}`
    );
    return response.data;
  }
}

export const profileAPI = new ProfileAPIClient();

// React Query hooks for better caching and state management
export const useUserProfile = (userId: string) => {
  // If using React Query:
  // return useQuery(['user-profile', userId], () => profileAPI.getUserProfile(userId));

  // Otherwise return the API client method
  return () => profileAPI.getUserProfile(userId);
};

export const useUserStatistics = (userId: string) => {
  return () => profileAPI.getUserStatistics(userId);
};

export const useUserConfessions = (
  userId: string,
  page: number,
  limit: number
) => {
  return () => profileAPI.getUserConfessions(userId, page, limit);
};
