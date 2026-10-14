import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, ShieldCheck, Star } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { apiErrorMessage } from '../services/api';
import { Button, Card, Field, Input, PageContainer, BrandLogo } from '../components/ui/kit';
import { useDocumentMeta } from '../hooks/useDocumentMeta';

function PasswordInput({
  id,
  placeholder,
  error,
  input,
}: {
  id: string;
  placeholder?: string;
  error?: string;
  input: React.InputHTMLAttributes<HTMLInputElement>;
}) {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  return (
    <Field label={t('auth.password')} error={error}>
      <span className="relative block">
        <Input
          id={id}
          type={show ? 'text' : 'password'}
          placeholder={placeholder}
          autoComplete={id === 'login-password' ? 'current-password' : 'new-password'}
          {...input}
          className="pr-11"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          aria-label={show ? t('auth.hidePassword') : t('auth.showPassword')}
          aria-pressed={show}
          className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 active:bg-slate-200"
        >
          {show ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
        </button>
      </span>
    </Field>
  );
}

function AuthShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <PageContainer className="max-w-5xl py-10 md:py-14">
      <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft md:grid-cols-2">
        {/* Visual panel: desktop only, reuses existing marketing copy */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-slate-900 p-8 md:flex lg:p-10">
          <img
            src="https://images.unsplash.com/photo-1528127269322-539801943592?auto=format&fit=crop&q=80&w=1000"
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover opacity-30"
          />
          <div className="relative">
            <BrandLogo dark />
            <p className="mt-6 max-w-xs text-2xl font-bold leading-snug tracking-tight text-white">{t('home.title')}</p>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-300">{t('footer.tagline')}</p>
          </div>
          <div className="relative flex flex-col gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-orange-200">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden /> {t('home.trusted')}
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-300">
              <ShieldCheck className="h-4 w-4 text-orange-300" aria-hidden /> {t('home.why1Title')}
            </span>
          </div>
        </div>
        <div className="p-6 sm:p-8 lg:p-10">{children}</div>
      </div>
    </PageContainer>
  );
}

export function Login() {
  const { t } = useTranslation();
  useDocumentMeta(t('auth.welcomeBack'));
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Only allow internal redirect targets (block open-redirect attacks).
  const rawNext = params.get('next') ?? '/';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';

  const loginSchema = useMemo(
    () =>
      z.object({
        email: z.string().email(t('validation.emailInvalid')),
        password: z.string().min(1, t('validation.passwordRequired')),
      }),
    [t],
  );

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
  });

  return (
    <AuthShell>
      <div className="mb-6 flex justify-center md:hidden">
        <Link to="/" className="rounded-lg" aria-label="Tour Booking - home"><BrandLogo /></Link>
      </div>
      <Card className="border-0 p-0 shadow-none">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('auth.welcomeBack')}</h1>
        <form
          className="mt-6 space-y-4"
          onSubmit={handleSubmit(async (v) => {
            try {
              const u = await login(v.email, v.password);
              // Admins landing on ?next=/checkout|/bookings|/favorites would bounce
              // off RequireCustomer — send them to the management counterpart at once.
              if (u?.role === 'ADMIN' && /^\/(checkout|bookings|favorites)/.test(next)) {
                navigate('/admin/bookings', { replace: true });
              } else {
                navigate(next, { replace: true });
              }
            } catch (err) {
              toast.error(apiErrorMessage(err, t('auth.loginFailed')));
            }
          })}
        >
          <Field label={t('auth.email')} error={errors.email?.message}>
            <Input id="login-email" {...register('email')} placeholder="you@example.com" inputMode="email" autoComplete="email" />
          </Field>
          <PasswordInput id="login-password" placeholder={t('auth.passwordPlaceholder')} error={errors.password?.message} input={{ ...register('password') }} />
          <div className="flex justify-end">
            <Link to="/forgot-password" className="rounded text-sm font-semibold text-orange-700 transition-colors hover:text-orange-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700">
              {t('auth.forgotPassword')}
            </Link>
          </div>
          <Button type="submit" isLoading={isSubmitting} className="w-full py-3">{t('auth.loginButton')}</Button>
        </form>
        <p className="mt-5 text-center text-sm text-slate-500">
          {t('auth.noAccount')}{' '}
          <Link to="/register" className="rounded font-semibold text-orange-700 transition-colors hover:text-orange-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700">{t('auth.signupButton')}</Link>
        </p>
        {/* Dev-only credential hint: never shown in production builds. */}
        {import.meta.env.DEV && (
          <p className="mt-4 rounded-xl bg-slate-50 p-3 text-center text-xs leading-relaxed text-slate-500">
            {t('auth.devAdmin')}
          </p>
        )}
      </Card>
    </AuthShell>
  );
}

export function Register() {
  const { t } = useTranslation();
  useDocumentMeta(t('auth.createAccount'));
  const { register: signup } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Preserve deep links just like Login (same open-redirect guard).
  const rawNext = params.get('next') ?? '/';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';
  const refFromUrl = params.get('ref') ?? '';

  const registerSchema = useMemo(
    () =>
      z.object({
        name: z.string().min(2, t('validation.nameRequired')),
        email: z.string().email(t('validation.emailInvalid')),
        phone: z
          .string()
          .regex(/^[0-9+\s-]{8,20}$/, t('validation.phoneInvalid'))
          .refine((s) => s === '' || (s.match(/[0-9]/g) ?? []).length >= 6, t('validation.phoneInvalid'))
          .optional()
          .or(z.literal('')),
        password: z.string().min(6, t('validation.passwordMin')),
        referralCode: z.string().max(20).optional().or(z.literal('')),
      }),
    [t],
  );

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { referralCode: refFromUrl },
  });

  useEffect(() => {
    reset((prev) => ({ ...(prev as object), referralCode: refFromUrl }) as never);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refFromUrl]);

  return (
    <AuthShell>
      <div className="mb-6 flex justify-center md:hidden">
        <Link to="/" className="rounded-lg" aria-label="Tour Booking - home"><BrandLogo /></Link>
      </div>
      <Card className="border-0 p-0 shadow-none">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('auth.createAccount')}</h1>
        <form
          className="mt-6 space-y-4"
          onSubmit={handleSubmit(async (v) => {
            try {
              const cleanRef = (v.referralCode || '').trim().toUpperCase() || undefined;
              const u = await signup({ name: v.name, email: v.email, password: v.password, phone: v.phone || undefined, referralCode: cleanRef });
              if ((u as { emailVerified?: boolean })?.emailVerified === false) {
                toast.success(t('auth.verifySent', { defaultValue: 'Đã gửi link xác thực vào email của bạn.' }) as string);
                navigate('/verify-email', { replace: true });
                return;
              }
              navigate(next, { replace: true });
            } catch (err) {
              toast.error(apiErrorMessage(err, t('auth.registerFailed')));
            }
          })}
        >
          <Field label={t('auth.fullName')} error={errors.name?.message}>
            <Input id="register-name" {...register('name')} placeholder={t('auth.fullNamePlaceholder')} autoComplete="name" />
          </Field>
          <Field label={t('auth.email')} error={errors.email?.message}>
            <Input id="register-email" {...register('email')} placeholder="you@example.com" inputMode="email" autoComplete="email" />
          </Field>
          <Field label={t('auth.phone')} error={errors.phone?.message}>
            <Input id="register-phone" {...register('phone')} placeholder="0901234567" inputMode="tel" autoComplete="tel" />
          </Field>
          <Field label="Mã giới thiệu (tùy chọn)">
            <Input id="register-ref" {...register('referralCode')} placeholder="REF-XXXXXX" autoComplete="off" />
          </Field>
          <PasswordInput id="register-password" placeholder={t('auth.passwordPlaceholder')} error={errors.password?.message} input={{ ...register('password') }} />
          <Button type="submit" isLoading={isSubmitting} className="w-full py-3">{t('auth.signupButton')}</Button>
        </form>
        <p className="mt-5 text-center text-sm text-slate-500">
          {t('auth.haveAccount')}{' '}
          <Link to="/login" className="rounded font-semibold text-orange-700 transition-colors hover:text-orange-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700">{t('auth.loginButton')}</Link>
        </p>
      </Card>
    </AuthShell>
  );
}
