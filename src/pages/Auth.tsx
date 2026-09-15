import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Compass } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { apiErrorMessage } from '../services/api';
import { Button, Card, Field, Input } from '../components/ui/kit';

export function Login() {
  const { t } = useTranslation();
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
    <div className="mx-auto max-w-md px-4 py-12">
      <Link to="/" className="flex items-center justify-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600 text-white"><Compass className="h-5 w-5" /></span>
        <span className="text-2xl font-bold text-slate-900">Tour Booking</span>
      </Link>
      <Card className="mt-6 p-8">
        <h1 className="text-xl font-bold text-slate-900">{t('auth.welcomeBack')}</h1>
        <form
          className="mt-5 space-y-4"
          onSubmit={handleSubmit(async (v) => {
            try {
              await login(v.email, v.password);
              navigate(next);
            } catch (err) {
              toast.error(apiErrorMessage(err, t('auth.loginFailed')));
            }
          })}
        >
          <Field label={t('auth.email')} error={errors.email?.message}><Input {...register('email')} placeholder="you@example.com" /></Field>
          <Field label={t('auth.password')} error={errors.password?.message}><Input type="password" {...register('password')} placeholder={t('auth.passwordPlaceholder')} /></Field>
          <Button type="submit" disabled={isSubmitting} className="w-full">{t('auth.loginButton')}</Button>
        </form>
        <p className="mt-5 text-center text-sm text-slate-500">
          {t('auth.noAccount')} <Link to="/register" className="font-semibold text-teal-700 hover:underline">{t('auth.signupButton')}</Link>
        </p>
        <p className="mt-3 rounded-xl bg-slate-50 p-3 text-center text-xs text-slate-500">
          {t('auth.devAdmin')}
        </p>
      </Card>
    </div>
  );
}

export function Register() {
  const { t } = useTranslation();
  const { register: signup } = useAuth();
  const navigate = useNavigate();

  const registerSchema = useMemo(
    () =>
      z.object({
        name: z.string().min(2, t('validation.nameRequired')),
        email: z.string().email(t('validation.emailInvalid')),
        phone: z.string().regex(/^[0-9+\s-]{8,20}$/, t('validation.phoneInvalid')).optional().or(z.literal('')),
        password: z.string().min(6, t('validation.passwordMin')),
      }),
    [t],
  );

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
  });

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <Link to="/" className="flex items-center justify-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600 text-white"><Compass className="h-5 w-5" /></span>
        <span className="text-2xl font-bold text-slate-900">Tour Booking</span>
      </Link>
      <Card className="mt-6 p-8">
        <h1 className="text-xl font-bold text-slate-900">{t('auth.createAccount')}</h1>
        <form
          className="mt-5 space-y-4"
          onSubmit={handleSubmit(async (v) => {
            try {
              await signup({ name: v.name, email: v.email, password: v.password, phone: v.phone || undefined });
              navigate('/');
            } catch (err) {
              toast.error(apiErrorMessage(err, t('auth.registerFailed')));
            }
          })}
        >
          <Field label={t('auth.fullName')} error={errors.name?.message}><Input {...register('name')} placeholder={t('auth.fullNamePlaceholder')} /></Field>
          <Field label={t('auth.email')} error={errors.email?.message}><Input {...register('email')} placeholder="you@example.com" /></Field>
          <Field label={t('auth.phone')} error={errors.phone?.message}><Input {...register('phone')} placeholder="0901234567" /></Field>
          <Field label={t('auth.password')} error={errors.password?.message}><Input type="password" {...register('password')} placeholder={t('auth.passwordPlaceholder')} /></Field>
          <Button type="submit" disabled={isSubmitting} className="w-full">{t('auth.signupButton')}</Button>
        </form>
        <p className="mt-5 text-center text-sm text-slate-500">
          {t('auth.haveAccount')} <Link to="/login" className="font-semibold text-teal-700 hover:underline">{t('auth.loginButton')}</Link>
        </p>
      </Card>
    </div>
  );
}
