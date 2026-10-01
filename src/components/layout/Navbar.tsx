import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Heart, Menu, LayoutDashboard, LogOut, User as UserIcon, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { LanguageSwitcher } from './LanguageSwitcher';
import { NotificationBell } from './NotificationBell';
import { BrandLogo, PageContainer } from '../ui/kit';

export function Navbar() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const links = [
    { to: '/', label: t('nav.home'), end: true },
    { to: '/tours', label: t('nav.tours'), end: false },
    { to: '/destinations', label: t('nav.destinations'), end: true },
    { to: '/about', label: t('nav.about'), end: true },
    { to: '/bookings', label: t('nav.myBookings'), end: true },
  ];
  // Admins manage every booking at /admin/bookings — the customer "My bookings"
  // page is meaningless for an account that can never book, so hide it.
  const visibleLinks = user?.role === 'ADMIN' ? links.filter((l) => l.to !== '/bookings') : links;

  const desktopLink = ({ isActive }: { isActive: boolean }) =>
    `relative inline-flex min-h-11 items-center rounded-lg px-1 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 ${
      isActive ? 'text-orange-700' : 'text-slate-600 hover:text-slate-900'
    }`;

  const isAdminActive = location.pathname.startsWith('/admin');
  // /tour/:id is a child of the tours section — keep the Tours tab highlighted
  // there (NavLink alone only matches /tours*).
  const isToursSection =
    location.pathname === '/tours' || location.pathname.startsWith('/tour/');

  // Keyboard: Escape closes the mobile menu and returns focus to the trigger.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open ]);

  // Close the mobile menu on route change (path or query — e.g. picking a
  // destination from the menu must not leave the panel open).
  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search]);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <PageContainer className="flex h-16 items-center justify-between gap-2">
        <Link to="/" className="shrink-0 rounded-lg" aria-label="Tour Booking - home">
          <BrandLogo />
        </Link>

        <nav aria-label="primary" className="hidden items-center gap-5 md:flex">
          {visibleLinks.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={(props) => desktopLink({ isActive: l.to === '/tours' ? props.isActive || isToursSection : props.isActive })}>
              {({ isActive }) => {
                const active = l.to === '/tours' ? isActive || isToursSection : isActive;
                return (
                  <>
                    {l.label}
                    <span
                      aria-hidden
                      className={`absolute inset-x-1 -bottom-0.5 h-0.5 rounded-full bg-orange-700 transition-opacity ${active ? 'opacity-100' : 'opacity-0'}`}
                    />
                  </>
                );
              }}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-1 md:flex">
          <LanguageSwitcher />
          {user ? (
            <>
              <NotificationBell />
              <Link
                to="/favorites"
                className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-rose-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 active:bg-slate-200"
                title={t('nav.favorites')}
                aria-label={t('nav.favorites')}
              >
                <Heart className="h-5 w-5" aria-hidden />
              </Link>
              {user.role === 'ADMIN' && (
                <Link
                  to="/admin"
                  className={`flex min-h-11 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 active:scale-[0.98] ${
                    isAdminActive ? 'bg-orange-700 text-white hover:bg-orange-800' : 'bg-slate-900 text-white hover:bg-slate-700'
                  }`}
                >
                  <LayoutDashboard className="h-4 w-4" aria-hidden /> {t('nav.admin')}
                </Link>
              )}
              <Link
                to="/profile"
                className="flex min-h-11 items-center gap-2 rounded-xl px-2 py-1.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 active:bg-slate-200"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-orange-700" aria-hidden>
                  <UserIcon className="h-4 w-4" aria-hidden />
                </span>
                <span className="max-w-24 truncate">{user.name}</span>
              </Link>
              <button
                onClick={() => {
                  logout();
                  navigate('/');
                }}
                className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 active:bg-slate-200"
                title={t('nav.logout')}
                aria-label={t('nav.logout')}
              >
                <LogOut className="h-5 w-5" aria-hidden />
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="inline-flex min-h-11 items-center rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700">
                {t('nav.login')}
              </Link>
              <Link to="/register" className="inline-flex min-h-11 items-center rounded-xl bg-orange-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-orange-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 active:scale-[0.98]">
                {t('nav.signup')}
              </Link>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 md:hidden">
          <LanguageSwitcher compact />
          {user && <NotificationBell />}
          <button
            ref={menuButtonRef}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 active:bg-slate-200"
            onClick={() => setOpen(!open)}
            aria-label={t('common.menu')}
            aria-expanded={open}
            aria-controls="mobile-nav"
          >
            {open ? <X className="h-6 w-6" aria-hidden /> : <Menu className="h-6 w-6" aria-hidden />}
          </button>
        </div>
      </PageContainer>

      {open && (
        <div className="border-t border-slate-200 bg-white px-4 py-4 md:hidden">
          <nav id="mobile-nav" aria-label="mobile" className="flex flex-col gap-1">
            {visibleLinks.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                onClick={() => setOpen(false)}
                className={({ isActive }) => {
                  const active = l.to === '/tours' ? isActive || isToursSection : isActive;
                  return `flex min-h-11 items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 ${active ? 'bg-orange-50 font-semibold text-orange-700' : 'text-slate-700 hover:bg-slate-100'}`;
                }}
              >
                {l.label}
              </NavLink>
            ))}
            {user ? (
              <>
                <NavLink
                  to="/favorites"
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `flex min-h-11 items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 ${isActive ? 'bg-orange-50 font-semibold text-orange-700' : 'text-slate-700 hover:bg-slate-100'}`
                  }
                >
                  {t('nav.favorites')}
                </NavLink>
                <NavLink
                  to="/profile"
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `flex min-h-11 items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 ${isActive ? 'bg-orange-50 font-semibold text-orange-700' : 'text-slate-700 hover:bg-slate-100'}`
                  }
                >
                  {t('nav.profile')}
                </NavLink>
                {user.role === 'ADMIN' && (
                  <Link to="/admin" onClick={() => setOpen(false)} className="flex min-h-11 items-center rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700">
                    {t('admin.title')}
                  </Link>
                )}
              <button
                onClick={() => {
                  logout();
                  navigate('/');
                }}
                  className="flex min-h-11 items-center rounded-xl px-3 py-2.5 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
                >
                  {t('nav.logout')}
                </button>
              </>
            ) : (
              <div className="mt-2 flex gap-2">
                <Link to="/login" onClick={() => setOpen(false)} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-slate-200 px-4 py-2.5 text-center text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 active:bg-slate-100">
                  {t('nav.login')}
                </Link>
                <Link to="/register" onClick={() => setOpen(false)} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-orange-700 px-4 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-orange-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 active:scale-[0.98]">
                  {t('nav.signup')}
                </Link>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
