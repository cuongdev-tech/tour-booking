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
    // A 401 means the token is rejected (expired/invalid) — drop it so a dead
    // token can't linger. 403 is scope-based (valid token, wrong role) and
    // must NOT log out: a customer hitting an admin route would be kicked
    // out on a perfectly live session.
    // AuthContext listens for 'auth:expired' to clear user state too, otherwise
    // the UI keeps showing a logged-in user whose every request fails.
    // Skip the cleanup when the failing request carried no token (public pages
    // like /register or password reset): there is nothing to drop and no
    // session to clear.
    const sentToken = Boolean(err?.config?.headers?.Authorization);
    if (sentToken && err?.response?.status === 401 && !window.location.pathname.startsWith('/login')) {
      localStorage.removeItem('tourbooking_token');
      window.dispatchEvent(new Event('auth:expired'));
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
