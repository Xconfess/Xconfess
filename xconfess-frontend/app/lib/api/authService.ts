import axios, { AxiosInstance } from 'axios';
import { getApiBaseUrl } from '@/app/lib/config';
import { authApi as canonicalAuthApi } from './auth';
import type { LoginCredentials, LoginResponse, RegisterData, RegisterResponse, User } from '../types/auth';

const API_URL = getApiBaseUrl();

/**
 * Axios instance for API calls
 */
const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(
  (config) => {
    config.withCredentials = true;
    return config;
  },
  (error) => Promise.reject(error),
);

export const authApi = {
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    return canonicalAuthApi.login(credentials);
  },

  async register(data: RegisterData): Promise<RegisterResponse> {
    const response = await apiClient.post<RegisterResponse>('/users/register', data);
    return response.data;
  },

  async getCurrentUser(): Promise<User | null> {
    return canonicalAuthApi.getCurrentUser();
  },

  async refreshSession(): Promise<User | null> {
    return canonicalAuthApi.refreshSession();
  },

  async logout(): Promise<void> {
    await canonicalAuthApi.logout();
  },
};

export default apiClient;
