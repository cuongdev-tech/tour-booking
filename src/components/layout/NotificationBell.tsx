import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell } from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { formatDateStr } from '../../i18n/format';
import { formatCurrency } from '../../types';

interface AdminNotif {
  id: string;
  bookingCode: string;
  total: number;
  customerName: string;
  travelDate: string;
  tour?: { title: string };
  user?: { name: string };
  payment?: { updatedAt: string };
}

interface CustomerNotif {
  id: string;
  bookingCode: string;
  total: number;
  tour?: { title: string };
  payment?: { status: string; updatedAt: string };
}

const POLL_MS = 20000;
const seenKey = (userId: string) => `tourbooking_pay_seen:${userId}`;

function loadSeen(userId: string): string | null {
  try {
    return localStorage.getItem(seenKey(userId));
  } catch {
    return null;
  }
}

/**
 * Role-aware notification bell.
 * - ADMIN: bank transfers customers reported, awaiting statement check.
 *   Badge = actionable count (rows vanish once handled, no seen-state needed).
 *   Click an item → the booking detail opens straight away.
 * - CUSTOMER: payment verdicts (admin confirmed PAID / rejected FAILED).
 *   Seen-state is a per-user localStorage baseline — no extra table.
 */
export function NotificationBell() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [adminItems, setAdminItems] = useState<AdminNotif[]>([]);
  const [adminTotal, setAdminTotal] = useState(0);
  const [customerItems, setCustomerItems] = useState<CustomerNotif[]>([]);
  const [seen, setSeen] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const isAdmin = user?.role === 'ADMIN';

  const fetchAdmin = useCallback(async (signal?: AbortSignal) => {
    try {
      const { data } = await api.get('/admin/payments/awaiting', { signal });
      setAdminItems(Array.isArray(data.data) ? data.data : []);
      setAdminTotal(typeof data.total === 'number' ? data.total : 0);
    } catch {
      /* badge stays stale rather than flashing errors every 20s */
    }
  }, []);

  const fetchCustomer = useCallback(async (signal?: AbortSignal) => {
    try {
      const { data } = await api.get('/bookings/payment-updates', { signal });
      setCustomerItems(Array.isArray(data.data) ? data.data : []);
    } catch {
      /* ignore */
    }
  }, []);

  // Seen baseline: first visit sets "now" (no historic flood), later visits
  // compare payment.updatedAt against it.
  useEffect(() => {
    if (!user || isAdmin) return;
    const stored = loadSeen(user.id);
    if (stored) {
      setSeen(stored);
    } else {
      const now = new Date().toISOString();
      try {
        localStorage.setItem(seenKey(user.id), now);
      } catch {
        /* ignore */
      }
      setSeen(now);
    }
  }, [user, isAdmin]);

  useEffect(() => {
    if (!user) return;
    const ctrl = new AbortController();
    if (isAdmin) void fetchAdmin(ctrl.signal);
    else void fetchCustomer(ctrl.signal);
    const id = window.setInterval(() => {
      if (isAdmin) void fetchAdmin();
      else void fetchCustomer();
    }, POLL_MS);
    const onFocus = () => {
      if (isAdmin) void fetchAdmin();
      else void fetchCustomer();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      ctrl.abort();
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [user, isAdmin, fetchAdmin, fetchCustomer]);

  // Close on route change / Escape / outside click.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open ]);

  if (!user) return null;

  const unreadCustomer = customerItems.filter((n) => !seen || (n.payment?.updatedAt ?? '') > seen);
  const badge = isAdmin ? adminTotal : unreadCustomer.length;

  const markSeen = () => {
    if (isAdmin || !user) return;
    const now = new Date().toISOString();
    try {
      localStorage.setItem(seenKey(user.id), now);
    } catch {
      /* ignore */
    }
    setSeen(now);
  };

  const openAdminItem = (id: string) => {
    setOpen(false);
    navigate(`/admin/bookings?open=${id}`);
  };
  const openCustomerItem = (code: string) => {
    setOpen(false);
    navigate(`/booking-success/${code}`);
  };

  const title = t('notif.title', { defaultValue: 'Thông báo' }) as string;

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) markSeen();
        }}
        aria-label={title}
        aria-expanded={open}
        aria-haspopup="true"
        className="relative flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-orange-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 active:bg-slate-200"
      >
        <Bell className="h-5 w-5" aria-hidden />
        {badge > 0 && (
          <span className="absolute right-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold tabular-nums text-white">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={title}
          className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lift"
        >
          <p className="border-b border-slate-100 px-4 py-3 text-sm font-bold text-slate-900">{title}</p>
          <ul className="max-h-80 overflow-y-auto">
            {isAdmin ? (
              adminItems.length === 0 ? (
                <li className="px-4 py-6 text-center text-sm text-slate-400">
                  {t('notif.empty', { defaultValue: 'Chưa có thông báo mới.' }) as string}
                </li>
              ) : (
                adminItems.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => openAdminItem(n.id)}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-orange-50/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-orange-700"
                    >
                      <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-orange-600" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-900">
                          {t('notif.transferClaimed', { defaultValue: 'Khách báo đã chuyển khoản' }) as string}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-slate-500">
                          {n.bookingCode} · {n.tour?.title ?? ''} · {n.user?.name ?? n.customerName}
                        </span>
                        <span className="mt-0.5 block text-xs tabular-nums text-slate-400">
                          {formatCurrency(n.total)}
                          {n.payment?.updatedAt ? ` · ${formatDateStr(n.payment.updatedAt)}` : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                ))
              )
            ) : customerItems.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-slate-400">
                {t('notif.empty', { defaultValue: 'Chưa có thông báo mới.' }) as string}
              </li>
            ) : (
              customerItems.map((n) => {
                const paid = n.payment?.status === 'PAID';
                const refunded = n.payment?.status === 'REFUNDED';
                const isNew = !seen || (n.payment?.updatedAt ?? '') > seen;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => openCustomerItem(n.bookingCode)}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-orange-50/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-orange-700"
                    >
                      <span
                        className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${isNew ? (paid ? 'bg-emerald-500' : refunded ? 'bg-sky-500' : 'bg-red-500') : 'bg-slate-200'}`}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-900">
                          {paid
                            ? (t('notif.paidConfirmed', { defaultValue: 'Chuyến đi đã được xác nhận' }) as string)
                            : refunded
                              ? (t('notif.refunded', { defaultValue: 'Đã hoàn tiền' }) as string)
                              : (t('notif.transferFailed', { defaultValue: 'Chuyển khoản chưa được ghi nhận' }) as string)}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-slate-500">
                          {n.bookingCode} · {n.tour?.title ?? ''}
                        </span>
                        <span className="mt-0.5 block text-xs tabular-nums text-slate-400">
                          {formatCurrency(n.total)}
                          {n.payment?.updatedAt ? ` · ${formatDateStr(n.payment.updatedAt)}` : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          <Link
            to={isAdmin ? '/admin/bookings' : '/bookings'}
            onClick={() => setOpen(false)}
            className="block border-t border-slate-100 px-4 py-2.5 text-center text-sm font-semibold text-orange-700 hover:bg-orange-50/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-orange-700"
          >
            {t('notif.viewAll', { defaultValue: 'Xem tất cả' }) as string}
          </Link>
        </div>
      )}
    </div>
  );
}
