import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import axios from 'axios';
import { api } from '../services/api';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { name: string; email: string; password: string; phone?: string }) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  updateProfile: (data: { name?: string; phone?: string }) => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem('tourbooking_token');
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.user);
    } catch (err) {
      // Only drop the session when the server rejects the token (401/403).
      // A transient network/5xx failure retries once before giving up, so a
      // blip at mount doesn't kick a valid user to the login page.
      if (axios.isAxiosError(err) && err.response && (err.response.status === 401 || err.response.status === 403)) {
        localStorage.removeItem('tourbooking_token');
        setUser(null);
      } else if (axios.isAxiosError(err) && !err.response) {
        await new Promise((r) => window.setTimeout(r, 1500));
        try {
          const { data } = await api.get('/auth/me');
          setUser(data.user);
          return;
        } catch {
          // Still offline — stay logged out visually but keep the token so a
          // later refresh can recover the session without re-login.
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // A 401 anywhere (e.g. token expired mid-session) clears user state at once
  // instead of leaving a fake logged-in UI until the next reload.
  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('tourbooking_token', data.token);
    setUser(data.user);
  }, []);

  const register = useCallback(async (input: { name: string; email: string; password: string; phone?: string }) => {
    const { data } = await api.post('/auth/register', input);
    localStorage.setItem('tourbooking_token', data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('tourbooking_token');
    setUser(null);
  }, []);

  const updateProfile = useCallback(
    async (input: { name?: string; phone?: string }) => {
      const { data } = await api.patch('/auth/me', input);
      setUser(data.user);
    },
    [],
  );

  const value = useMemo(
    () => ({ user, loading, login, register, logout, refresh, updateProfile }),
    [user, loading, login, register, logout, refresh, updateProfile],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
