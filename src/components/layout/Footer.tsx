import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Mail, MapPin, Phone } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { BrandLogo, PageContainer } from '../ui/kit';
import { LanguageSwitcher } from './LanguageSwitcher';

export function Footer() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const linkClass = 'rounded transition-colors hover:text-white hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400';
  return (
    <footer className="bg-slate-900 text-slate-400">
      <PageContainer className="grid grid-cols-1 gap-10 py-14 sm:grid-cols-2 md:grid-cols-4">
        <div>
          <Link to="/" className="inline-flex rounded-lg" aria-label="Tour Booking - home">
            <BrandLogo dark />
          </Link>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-400">
            {t('footer.tagline')}
          </p>
        </div>
        <nav aria-label={t('footer.explore')}>
          <h3 className="text-xs font-bold uppercase tracking-widest text-white">{t('footer.explore')}</h3>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><Link to="/tours" className={linkClass}>{t('footer.allTours')}</Link></li>
            <li><Link to="/tours?category=Beach" className={linkClass}>{t('footer.beach')}</Link></li>
            <li><Link to="/tours?category=Mountains" className={linkClass}>{t('footer.mountains')}</Link></li>
            <li><Link to="/tours?category=Culture" className={linkClass}>{t('footer.culture')}</Link></li>
            <li><Link to="/tours?category=Relaxation" className={linkClass}>{t('footer.relaxation')}</Link></li>
            <li><Link to="/destinations" className={linkClass}>{t('nav.destinations')}</Link></li>
          </ul>
        </nav>
        <nav aria-label={t('footer.account')}>
          <h3 className="text-xs font-bold uppercase tracking-widest text-white">{t('footer.account')}</h3>
          <ul className="mt-4 space-y-2.5 text-sm">
            {/* Admins manage bookings at /admin/bookings — hide the customer page like the navbar does. */}
            {user?.role !== 'ADMIN' && (
              <li><Link to="/bookings" className={linkClass}>{t('footer.myBookings')}</Link></li>
            )}
            <li><Link to="/favorites" className={linkClass}>{t('footer.favorites')}</Link></li>
            <li><Link to="/profile" className={linkClass}>{t('footer.profile')}</Link></li>
          </ul>
        </nav>
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-white">{t('footer.contact')}</h3>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li className="flex items-center gap-2"><Mail className="h-4 w-4 shrink-0 text-orange-400" aria-hidden />support@tourbooking.local</li>
            <li className="flex items-center gap-2"><Phone className="h-4 w-4 shrink-0 text-orange-400" aria-hidden />Hotline: 1900 1234</li>
            <li className="flex items-center gap-2"><MapPin className="h-4 w-4 shrink-0 text-orange-400" aria-hidden />Ho Chi Minh City, Vietnam</li>
          </ul>
        </div>
      </PageContainer>
      <div className="border-t border-slate-800">
        <PageContainer className="flex flex-col items-center justify-between gap-3 py-5 text-sm text-slate-500 sm:flex-row">
          <p>&copy; {new Date().getFullYear()} {t('footer.rights')}</p>
          <LanguageSwitcher onDark />
        </PageContainer>
      </div>
    </footer>
  );
}
