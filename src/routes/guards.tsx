import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { Skeleton } from '../components/ui/kit';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10">
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10">
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (user.role !== 'ADMIN') return <Navigate to="/" replace />;
  return <>{children}</>;
}

/**
 * Customer-only pages (currently: checkout, my bookings). Admin accounts manage
 * everything but never book — send them to the management counterpart instead
 * of a dead customer page whose actions would 403 anyway.
 */
export function RequireCustomer({ children, to = '/admin/bookings', quiet = false }: { children: ReactNode; to?: string; quiet?: boolean }) {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  const isAdmin = user?.role === 'ADMIN';
  useEffect(() => {
    if (!loading && isAdmin && !quiet) {
      toast.error(
        t('backendErrors.adminNoBooking', {
          defaultValue: 'Tài khoản quản trị không thể đặt tour, hãy dùng tài khoản khách hàng',
        }) as string,
      );
    }
  }, [loading, isAdmin, quiet, t]);
  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10">
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (isAdmin) return <Navigate to={to} replace />;
  return <>{children}</>;
}
