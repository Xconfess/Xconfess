import axios from "axios";

/**
 * Shared axios client for browser-facing API calls.
 * No baseURL set — all paths must be relative /api/* proxy routes.
 * The proxy routes (app/api/**) are the only code allowed to contact the backend host.
 */
const apiClient = axios.create({
  baseURL: "", // relative — all requests go through Next.js /api/* proxy routes
  withCredentials: true,
});

export default apiClient;