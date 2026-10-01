import { Link, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarCheck, LayoutDashboard, Mail, Map, MessageSquareText, Ticket, Users } from 'lucide-react';
import { PageContainer } from '../components/ui/kit';

export function AdminLayout() {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  const tabs = [
    { to: '/admin', label: t('admin.dashboard'), icon: LayoutDashboard, exact: true },
    { to: '/admin/tours', label: t('admin.tours'), icon: Map, exact: false },
    { to: '/admin/bookings', label: t('admin.bookings'), icon: CalendarCheck, exact: false },
    { to: '/admin/users', label: t('admin.users'), icon: Users, exact: false },
    { to: '/admin/coupons', label: t('admin.coupons'), icon: Ticket, exact: false },
    { to: '/admin/reviews', label: t('admin.reviews'), icon: MessageSquareText, exact: false },
    { to: '/admin/contact', label: t('admin.contact'), icon: Mail, exact: false },
  ];
  const isActive = (tab: (typeof tabs)[number]) => (tab.exact ? pathname === tab.to : pathname === tab.to || pathname.startsWith(`${tab.to}/`));

  return (
    <PageContainer className="py-8 md:py-10">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">{t('admin.title')}</h1>
      <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-5">
        {/* Sidebar on desktop, scrollable rail on mobile */}
        <nav aria-label={t('admin.title')} className="lg:col-span-1 lg:sticky lg:top-24">
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 lg:flex-col">
            {tabs.map((tab) => {
              const active = isActive(tab);
              return (
                <Link
                  key={tab.to}
                  to={tab.to}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-11 shrink-0 items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 ${
                    active
                      ? 'bg-orange-700 text-white shadow-sm'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <tab.icon className="h-4 w-4 shrink-0" aria-hidden />
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </nav>
        <div className="min-w-0 lg:col-span-4"><Outlet /></div>
      </div>
    </PageContainer>
  );
}
