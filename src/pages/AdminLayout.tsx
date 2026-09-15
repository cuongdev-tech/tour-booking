import { Link, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export function AdminLayout() {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  const tabs = [
    { to: '/admin', label: t('admin.dashboard') },
    { to: '/admin/tours', label: t('admin.tours') },
    { to: '/admin/bookings', label: t('admin.bookings') },
    { to: '/admin/users', label: t('admin.users') },
    { to: '/admin/coupons', label: t('admin.coupons') },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-slate-900">{t('admin.title')}</h1>
      <div className="mt-5 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${
              pathname === tab.to ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>
      <div className="mt-6"><Outlet /></div>
    </div>
  );
}
