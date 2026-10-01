import { useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { RequireAdmin, RequireAuth, RequireCustomer } from './routes/guards';
import { Home } from './pages/Home';
import { Tours } from './pages/Tours';
import { Destinations } from './pages/Destinations';
import { TourDetails } from './pages/TourDetails';
import { Checkout } from './pages/Checkout';
import { BookingSuccess } from './pages/BookingSuccess';
import { VerifyBooking } from './pages/VerifyBooking';
import { Login, Register } from './pages/Auth';
import { ForgotPassword, ResetPassword } from './pages/PasswordReset';
import { Profile } from './pages/Profile';
import { Bookings } from './pages/Bookings';
import { Favorites } from './pages/Favorites';
import { About } from './pages/About';
import { NotFound } from './pages/NotFound';
import { AdminLayout } from './pages/AdminLayout';
import { AdminDashboard } from './pages/admin/Dashboard';
import { DailyRevenue } from './pages/admin/DailyRevenue';
import { ToursManage } from './pages/admin/ToursManage';
import { BookingsManage } from './pages/admin/BookingsManage';
import { UsersManage } from './pages/admin/UsersManage';
import { CouponsManage } from './pages/admin/CouponsManage';
import { ReviewsManage } from './pages/admin/ReviewsManage';
import { ContactManage } from './pages/admin/ContactManage';

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    // Anchor links (e.g. /#destinations) scroll to the section instead of top.
    if (hash) {
      // Wait a tick so the target page has rendered (home data loads async).
      const t = window.setTimeout(() => {
        document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
      return () => window.clearTimeout(t);
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ScrollToTop />
        <div className="flex min-h-screen flex-col bg-slate-50 font-sans text-slate-900 antialiased">
          <Navbar />
          <main className="flex-grow">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/tours" element={<Tours />} />
              <Route path="/destinations" element={<Destinations />} />
              <Route path="/tour/:id" element={<TourDetails />} />
              <Route path="/about" element={<About />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              {/* legacy /auth redirects */}
              <Route path="/auth" element={<Login />} />
              <Route path="/checkout" element={<RequireAuth><RequireCustomer><Checkout /></RequireCustomer></RequireAuth>} />
              <Route path="/booking-success/:code" element={<RequireAuth><RequireCustomer to="/admin/bookings" quiet><BookingSuccess /></RequireCustomer></RequireAuth>} />
              {/* Public ticket verification (QR target, no login) */}
              <Route path="/verify/:code" element={<VerifyBooking />} />
              <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
              <Route path="/bookings" element={<RequireAuth><RequireCustomer to="/admin/bookings" quiet><Bookings /></RequireCustomer></RequireAuth>} />
              <Route path="/favorites" element={<RequireAuth><Favorites /></RequireAuth>} />
              <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
                <Route index element={<AdminDashboard />} />
                <Route path="doanh-thu-ngay" element={<DailyRevenue />} />
                <Route path="tours" element={<ToursManage />} />
                <Route path="bookings" element={<BookingsManage />} />
                <Route path="users" element={<UsersManage />} />
                <Route path="coupons" element={<CouponsManage />} />
                <Route path="reviews" element={<ReviewsManage />} />
                <Route path="contact" element={<ContactManage />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
          <Footer />
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
