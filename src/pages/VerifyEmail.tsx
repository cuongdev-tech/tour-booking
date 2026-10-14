import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api, apiErrorMessage } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Button, Card, Field, Input, PageContainer, BrandLogo } from '../components/ui/kit';
import { useDocumentMeta } from '../hooks/useDocumentMeta';

export function VerifyEmail() {
  const { t } = useTranslation();
  useDocumentMeta(t('auth.verifyTitle', { defaultValue: 'Xác thực email' }) as string);
  const { refresh } = useAuth();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [status, setStatus] = useState<'idle' | 'working' | 'done' | 'error'>(token ? 'working' : 'idle');
  const [resendEmail, setResendEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    const ctrl = new AbortController();
    setStatus('working');
    api
      .post('/auth/verify-email', { token }, { signal: ctrl.signal })
      .then(() => { if (alive) setStatus('done'); })
      .catch(() => { if (alive) setStatus('error'); })
      .finally(() => {
        if (alive) void refresh().catch(() => undefined);
      });
    return () => {
      alive = false;
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const resend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail.trim()) return;
    setResending(true);
    try {
      await api.post('/auth/resend-verification', { email: resendEmail.trim() });
      setResent(true);
    } catch (err) {
      toast.error(apiErrorMessage(err, t('tours.loadError') as string));
    } finally {
      setResending(false);
    }
  };

  return (
    <PageContainer className="max-w-5xl py-10 md:py-14">
      <div className="mx-auto grid max-w-2xl grid-cols-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <div className="p-6 sm:p-8">
          <div className="mb-6 flex justify-center">
            <Link to="/" className="rounded-lg" aria-label="Tour Booking - home"><BrandLogo /></Link>
          </div>
          <Card className="border-0 p-0 shadow-none">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {t('auth.verifyTitle', { defaultValue: 'Xác thực email' }) as string}
            </h1>
            {status === 'working' && (
              <p role="status" className="mt-6 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">…</p>
            )}
            {status === 'done' && (
              <p role="status" className="mt-6 rounded-xl bg-emerald-50 p-4 text-sm font-medium text-emerald-700">
                {t('auth.verifyDone', { defaultValue: 'Email đã được xác thực. Bạn có thể đặt tour ngay.' }) as string}{' '}
                <Link to="/tours" className="font-semibold underline">Tours</Link>
              </p>
            )}
            {status === 'error' && (
              <p role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-sm font-medium text-red-700">
                {t('auth.verifyInvalid', { defaultValue: 'Link xác thực không hợp lệ hoặc đã hết hạn (24h).' }) as string}
              </p>
            )}
            {(status === 'idle' || status === 'error') && (
              <form onSubmit={resend} className="mt-6 space-y-3">
                <p className="text-sm text-slate-500">
                  {t('auth.verifyResendHint', { defaultValue: 'Nhập email để gửi lại link xác thực.' }) as string}
                </p>
                {resent ? (
                  <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm font-medium text-emerald-700">
                    {t('auth.verifyResent', { defaultValue: 'Nếu email chưa xác thực, link mới đang được gửi.' }) as string}
                  </p>
                ) : (
                  <>
                    <Field label={t('auth.email')}>
                      <Input value={resendEmail} onChange={(e) => setResendEmail(e.target.value)} placeholder="you@example.com" inputMode="email" />
                    </Field>
                    <Button type="submit" isLoading={resending} className="w-full py-3">
                      {t('auth.verifyResend', { defaultValue: 'Gửi lại link' }) as string}
                    </Button>
                  </>
                )}
              </form>
            )}
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
