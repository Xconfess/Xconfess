import axios, { AxiosError, AxiosResponse } from "axios";
import { logError } from "@/app/lib/utils/errorHandler";
import { useAuthStore } from "@/app/lib/store/authStore";

/**
 * Axios instance for browser-facing API calls.
 * No baseURL is set — all paths must be relative /api/* proxy routes.
 * The proxy routes (app/api/**) are the only code allowed to contact the backend host.
 */
const apiClient = axios.create({
	baseURL: "",
	headers: { "Content-Type": "application/json" },
	timeout: 30000,
});

/**
 * Read the XSRF-TOKEN cookie set by the backend after each request.
 * Returns an empty string if the cookie is absent (e.g. before first response).
 */
function getCsrfToken(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}
// Request interceptor for adding auth token
apiClient.interceptors.request.use(
	(config) => {
		// Tokens are now handled via secure session cookies
		config.withCredentials = true;

		// Generate correlation ID for tracing
		const correlationId = crypto.randomUUID();
		config.headers["X-Correlation-ID"] = correlationId;
        // Send CSRF token on state-changing requests
        const csrfToken = getCsrfToken();
        if (csrfToken) {
            config.headers['X-XSRF-TOKEN'] = csrfToken;
        }
		config.correlationId = correlationId;

		return config;
	},
	(error) => {
		logError(error, "API Request Interceptor");
		return Promise.reject(error);
	},
);

// Extend AxiosRequestConfig to support per-request retry tracking and correlation
declare module "axios" {
	interface InternalAxiosRequestConfig {
		__retryCount?: number;
		correlationId?: string;
	}
}

const MAX_RETRIES = 3;
const DEV_BYPASS_AUTH_ENABLED =
	process.env.NODE_ENV === "development" &&
	process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "true";

function shouldSuppressExpectedDevOfflineError(error: AxiosError): boolean {
	return DEV_BYPASS_AUTH_ENABLED && !error.response;
}

// Response interceptor for error handling and retries
apiClient.interceptors.response.use(
	(response: AxiosResponse) => response,
	async (error: AxiosError) => {
		const config = error.config;
		if (!config) {
			return Promise.reject(error);
		}

		config.__retryCount = config.__retryCount ?? 0;

		// Handle 401 Unauthorized â€” clear auth state and let AuthGuard handle redirect
		if (error.response?.status === 401) {
			// Signal the store: clears localStorage tokens + resets isAuthenticated.
			// AuthGuard detects isAuthenticated: false and does router.push('/login').
			useAuthStore.getState().logout();

			logError(error, "API Client - Unauthorized", { url: config.url });
			return Promise.reject(error);
		}

		// Handle 403 Forbidden â€” no retry
		if (error.response?.status === 403) {
			logError(error, "API Client - Forbidden", { url: config.url });
			return Promise.reject(error);
		}

		// Determine if this error is retryable
		const isRetryable =
			error.response?.status === 429 ||
			(error.response?.status !== undefined &&
				error.response.status >= 500) ||
			!error.response; // network error

		if (isRetryable && config.__retryCount < MAX_RETRIES) {
			config.__retryCount++;
			const delayMs = Math.pow(2, config.__retryCount) * 1000;
			await new Promise((resolve) => setTimeout(resolve, delayMs));
			return apiClient(config);
		}

		const context = !error.response
			? "API Client - Network Error"
			: error.response.status === 429
				? "API Client - Too Many Requests"
				: error.response.status >= 500
					? "API Client - Server Error"
					: "API Client - Request Failed";

		if (shouldSuppressExpectedDevOfflineError(error)) {
			console.debug("Skipping expected local API error while backend is offline.", {
				url: config.url,
				retries: config.__retryCount,
				correlationId: config.correlationId,
			});
		} else {
			logError(
				error,
				config.__retryCount > 0
					? `${context} (after ${config.__retryCount} retries)`
					: context,
				{
					url: config.url,
					status: error.response?.status,
					retries: config.__retryCount,
					correlationId: config.correlationId,
				},
			);
		}

		return Promise.reject(error);
	},
);

export default apiClient;
export { apiClient, AxiosError };

export type DataExportStatus = "PENDING" | "PROCESSING" | "READY" | "FAILED" | "EXPIRED";

export interface DataExportHistoryItem {
	id: string;
	status: DataExportStatus;
	createdAt: string;
	expiresAt: number | null;
	canRedownload: boolean;
	canRequestNewLink: boolean;
	downloadUrl: string | null;
}

export interface DataExportHistoryResponse {
	latest: DataExportHistoryItem | null;
	history: DataExportHistoryItem[];
}

export const dataExportApi = {
	async getHistory() {
		const response = await apiClient.get<DataExportHistoryResponse>("/api/data-export/history");
		return response.data;
	},

	async requestExport() {
		const response = await apiClient.post<{ requestId: string; status: string }>(
			"/api/data-export/request",
		);
		return response.data;
	},

	async redownload(requestId: string) {
		const response = await apiClient.post<{ downloadUrl: string }>(
			`/api/data-export/${requestId}/redownload`,
		);
		return response.data;
	},
};

