import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { api, apiErrorMessage } from '../services/api';
import { Button, Card, Field, Input, PageContainer, BrandLogo } from '../components/ui/kit';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import type { ReactNode } from 'react';

function ResetShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <PageContainer className="max-w-5xl py-10 md:py-14">
      <div className="mx-auto grid max-w-2xl grid-cols-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <div className="p-6 sm:p-8">
          <div className="mb-6 flex justify-center">
            <Link to="/" className="rounded-lg" aria-label="Tour Booking - home"><BrandLogo /></Link>
          </div>
          <Card className="border-0 p-0 shadow-none">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
            {children}
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}

export function ForgotPassword() {
  const { t } = useTranslation();
  useDocumentMeta(t('auth.resetTitle'));
  const schema = useMemo(
    () => z.object({ email: z.string().email(t('validation.emailInvalid')) }),
    [t],
  );
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
  });
  const [sent, setSent] = useState(false);

  return (
    <ResetShell title={t('auth.resetTitle')}>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">{t('auth.resetHint')}</p>
      {sent ? (
        <p role="status" className="mt-6 rounded-xl bg-emerald-50 p-4 text-sm font-medium text-emerald-700">
          {t('auth.resetSent')}
        </p>
      ) : (
        <form
          className="mt-6 space-y-4"
          onSubmit={handleSubmit(async (v) => {
            try {
              await api.post('/auth/forgot-password', { email: v.email });
              setSent(true);
            } catch (err) {
              toast.error(apiErrorMessage(err, t('tours.loadError')));
            }
          })}
        >
          <Field label={t('auth.email')} error={errors.email?.message}>
            <Input id="forgot-email" {...register('email')} placeholder="you@example.com" inputMode="email" autoComplete="email" />
          </Field>
          <Button type="submit" isLoading={isSubmitting} className="w-full py-3">{t('auth.sendResetLink')}</Button>
        </form>
      )}
      <p className="mt-5 text-center text-sm text-slate-500">
        <Link to="/login" className="rounded font-semibold text-orange-700 transition-colors hover:text-orange-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700">
          {t('auth.backToLogin')}
        </Link>
      </p>
    </ResetShell>
  );
}

export function ResetPassword() {
  const { t } = useTranslation();
  useDocumentMeta(t('auth.resetTitle'));
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  // Preserve deep links (same open-redirect guard as Login).
  const rawNext = params.get('next') ?? '/';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';

  const schema = useMemo(
    () =>
      z.object({
        password: z.string().min(6, t('validation.passwordMin')),
      }),
    [t],
  );
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
  });

  if (!token) {
    return (
      <ResetShell title={t('auth.resetTitle')}>
        <p role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-sm font-medium text-red-700">
          {t('backendErrors.resetInvalid')}
        </p>
        <p className="mt-5 text-center text-sm text-slate-500">
          <Link to="/login" className="rounded font-semibold text-orange-700 transition-colors hover:text-orange-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700">
            {t('auth.backToLogin')}
          </Link>
        </p>
      </ResetShell>
    );
  }

  return (
    <ResetShell title={t('auth.resetTitle')}>
      <form
        className="mt-6 space-y-4"
        onSubmit={handleSubmit(async (v) => {
          try {
            const { data } = await api.post('/auth/reset-password', { token, password: v.password });
            localStorage.setItem('tourbooking_token', data.token);
            try {
              // Reuse login to populate context with the fresh credentials.
              await login(data.user.email, v.password);
            } catch {
              localStorage.removeItem('tourbooking_token');
              navigate('/login', { replace: true });
              return;
            }
            toast.success(t('auth.resetSuccess'));
            navigate(next, { replace: true });
          } catch (err) {
            toast.error(apiErrorMessage(err, t('backendErrors.resetInvalid')));
          }
        })}
      >
        <Field label={t('auth.newPassword')} error={errors.password?.message}>
          <Input id="reset-password" type="password" {...register('password')} placeholder={t('auth.passwordPlaceholder')} autoComplete="new-password" />
        </Field>
        <Button type="submit" isLoading={isSubmitting} className="w-full py-3">{t('auth.setNewPassword')}</Button>
      </form>
      <p className="mt-5 text-center text-sm text-slate-500">
        <Link to="/login" className="rounded font-semibold text-orange-700 transition-colors hover:text-orange-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700">
          {t('auth.backToLogin')}
        </Link>
      </p>
    </ResetShell>
  );
}
