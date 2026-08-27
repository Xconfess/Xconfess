// lib/api/notification.ts

import apiClient from "./client";
import { NotificationFilter, PaginatedNotifications, NotificationPreferences } from "@/app/types/notifications";

class NotificationAPIClient {
  async getNotifications(filter?: NotificationFilter): Promise<PaginatedNotifications> {
    const params = new URLSearchParams();
    if (filter?.type) params.append("type", filter.type);
    if (filter?.isRead !== undefined) params.append("isRead", String(filter.isRead));
    params.append("page", String(filter?.page || 1));
    params.append("limit", String(filter?.limit || 20));

    // Notice we skip the /api prefix because apiClient's baseURL handles it
    const response = await apiClient.get<PaginatedNotifications>(`/notifications?${params.toString()}`);
    return response.data;
  }

  async markAsRead(notificationId: string): Promise<void> {
    await apiClient.patch(`/notifications/${notificationId}/read`);
  }

  async markAllAsRead(): Promise<void> {
    await apiClient.patch("/notifications/read-all");
  }

  async deleteNotification(notificationId: string): Promise<void> {
    await apiClient.delete(`/notifications/${notificationId}`);
  }

  async getPreferences(): Promise<NotificationPreferences> {
    const response = await apiClient.get<NotificationPreferences>("/notifications/preferences");
    return response.data;
  }

  async updatePreferences(preferences: Partial<NotificationPreferences>): Promise<NotificationPreferences> {
    const response = await apiClient.put<NotificationPreferences>("/notifications/preferences", preferences);
    return response.data;
  }
}

export const notificationApi = new NotificationAPIClient();
