import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Compass } from 'lucide-react';

export function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 py-12 sm:px-6 md:grid-cols-4 lg:px-8">
        <div>
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-600 text-white">
              <Compass className="h-5 w-5" />
            </span>
            <span className="text-lg font-bold text-slate-900">Tour Booking</span>
          </Link>
          <p className="mt-4 text-sm text-slate-500">
            {t('footer.tagline')}
          </p>
        </div>
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-900">{t('footer.explore')}</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-500">
            <li><Link to="/tours" className="hover:text-teal-700">{t('footer.allTours')}</Link></li>
            <li><Link to="/tours?category=Beach" className="hover:text-teal-700">{t('footer.beach')}</Link></li>
            <li><Link to="/tours?category=Mountains" className="hover:text-teal-700">{t('footer.mountains')}</Link></li>
            <li><Link to="/tours?category=Culture" className="hover:text-teal-700">{t('footer.culture')}</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-900">{t('footer.account')}</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-500">
            <li><Link to="/bookings" className="hover:text-teal-700">{t('footer.myBookings')}</Link></li>
            <li><Link to="/favorites" className="hover:text-teal-700">{t('footer.favorites')}</Link></li>
            <li><Link to="/profile" className="hover:text-teal-700">{t('footer.profile')}</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-900">{t('footer.contact')}</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-500">
            <li>support@tourbooking.local</li>
            <li>Hotline: 1900 1234</li>
            <li>Ho Chi Minh City, Vietnam</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-200 py-6 text-center text-sm text-slate-400">
        &copy; {new Date().getFullYear()} {t('footer.rights')}
      </div>
    </footer>
  );
}
