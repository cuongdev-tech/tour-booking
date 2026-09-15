import axios from 'axios';
import { translateBackendError } from '../i18n/backendErrors';

const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api';

export const api = axios.create({ baseURL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('tourbooking_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401 && !window.location.pathname.startsWith('/login')) {
      const msg: string = err.response.data?.message ?? '';
      if (msg.toLowerCase().includes('token')) {
        localStorage.removeItem('tourbooking_token');
      }
    }
    return Promise.reject(err);
  },
);

export function apiErrorMessage(err: unknown, fallback?: string): string {
  if (axios.isAxiosError(err)) {
    const msg = err.response?.data?.message;
    if (typeof msg === 'string' && msg.length > 0) return translateBackendError(msg, fallback);
  }
  return fallback ?? translateBackendError('', fallback);
}
