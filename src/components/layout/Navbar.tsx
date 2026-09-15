import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Compass, Heart, Menu, LayoutDashboard, LogOut, User as UserIcon, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { LanguageSwitcher } from './LanguageSwitcher';

export function Navbar() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const links = [
    { to: '/', label: t('nav.home') },
    { to: '/tours', label: t('nav.tours') },
    { to: '/tours?sort=rating', label: t('nav.destinations') },
    { to: '/about', label: t('nav.about') },
    { to: '/bookings', label: t('nav.myBookings') },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-600 text-white">
            <Compass className="h-5 w-5" />
          </span>
          <span className="text-lg font-bold tracking-tight text-slate-900">Tour Booking</span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {links.map((l) => (
            <Link key={l.label} to={l.to} className="text-sm font-medium text-slate-600 hover:text-teal-700">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-1 md:flex">
          <LanguageSwitcher />
          {user ? (
            <>
              <Link
                to="/favorites"
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 hover:text-rose-600"
                title={t('nav.favorites')}
              >
                <Heart className="h-5 w-5" />
              </Link>
              {user.role === 'ADMIN' && (
                <Link
                  to="/admin"
                  className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700"
                >
                  <LayoutDashboard className="h-4 w-4" /> {t('nav.admin')}
                </Link>
              )}
              <Link
                to="/profile"
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-100 text-teal-700">
                  <UserIcon className="h-4 w-4" />
                </span>
                <span className="max-w-24 truncate">{user.name}</span>
              </Link>
              <button
                onClick={() => {
                  logout();
                  navigate('/');
                }}
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 hover:text-red-600"
                title={t('nav.logout')}
              >
                <LogOut className="h-5 w-5" />
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                {t('nav.login')}
              </Link>
              <Link to="/register" className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700">
                {t('nav.signup')}
              </Link>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 md:hidden">
          <LanguageSwitcher compact />
          <button className="rounded-xl p-2 text-slate-600 hover:bg-slate-100" onClick={() => setOpen(!open)} aria-label={t('common.menu')}>
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-slate-200 bg-white px-4 py-4 md:hidden">
          <div className="flex flex-col gap-1">
            {links.map((l) => (
              <Link
                key={l.label}
                to={l.to}
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                {l.label}
              </Link>
            ))}
            {user ? (
              <>
                <Link to="/favorites" onClick={() => setOpen(false)} className="rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                  {t('nav.favorites')}
                </Link>
                <Link to="/profile" onClick={() => setOpen(false)} className="rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                  {t('nav.profile')}
                </Link>
                {user.role === 'ADMIN' && (
                  <Link to="/admin" onClick={() => setOpen(false)} className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100">
                    {t('admin.title')}
                  </Link>
                )}
                <button
                  onClick={() => {
                    logout();
                    setOpen(false);
                    navigate('/');
                  }}
                  className="rounded-xl px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  {t('nav.logout')}
                </button>
              </>
            ) : (
              <div className="mt-2 flex gap-2">
                <Link to="/login" onClick={() => setOpen(false)} className="flex-1 rounded-xl border border-slate-200 px-4 py-2 text-center text-sm font-semibold">
                  {t('nav.login')}
                </Link>
                <Link to="/register" onClick={() => setOpen(false)} className="flex-1 rounded-xl bg-teal-600 px-4 py-2 text-center text-sm font-semibold text-white">
                  {t('nav.signup')}
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
