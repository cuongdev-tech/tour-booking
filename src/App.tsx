import { useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { RequireAdmin, RequireAuth } from './routes/guards';
import { Home } from './pages/Home';
import { Tours } from './pages/Tours';
import { TourDetails } from './pages/TourDetails';
import { Checkout } from './pages/Checkout';
import { BookingSuccess } from './pages/BookingSuccess';
import { Login, Register } from './pages/Auth';
import { Profile } from './pages/Profile';
import { Bookings } from './pages/Bookings';
import { Favorites } from './pages/Favorites';
import { About } from './pages/About';
import { AdminLayout } from './pages/AdminLayout';
import { AdminDashboard } from './pages/admin/Dashboard';
import { ToursManage } from './pages/admin/ToursManage';
import { BookingsManage } from './pages/admin/BookingsManage';
import { UsersManage } from './pages/admin/UsersManage';
import { CouponsManage } from './pages/admin/CouponsManage';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
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
              <Route path="/tour/:id" element={<TourDetails />} />
              <Route path="/about" element={<About />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              {/* legacy /auth redirects */}
              <Route path="/auth" element={<Login />} />
              <Route path="/checkout" element={<RequireAuth><Checkout /></RequireAuth>} />
              <Route path="/booking-success/:code" element={<RequireAuth><BookingSuccess /></RequireAuth>} />
              <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
              <Route path="/bookings" element={<RequireAuth><Bookings /></RequireAuth>} />
              <Route path="/favorites" element={<RequireAuth><Favorites /></RequireAuth>} />
              <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
                <Route index element={<AdminDashboard />} />
                <Route path="tours" element={<ToursManage />} />
                <Route path="bookings" element={<BookingsManage />} />
                <Route path="users" element={<UsersManage />} />
                <Route path="coupons" element={<CouponsManage />} />
              </Route>
              <Route path="*" element={<Home />} />
            </Routes>
          </main>
          <Footer />
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
