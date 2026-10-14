import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api, apiErrorMessage } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

export function VerifyBanner() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  useEffect(() => {
    setSent(false);
    setSending(false);
  }, [user?.id]);
  if (!user || user.role !== 'CUSTOMER' || (user.emailVerified ?? false) === true) return null;
  return (
    <div role="alert" className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-center text-sm text-amber-800">
      {t('auth.verifyBanner', { defaultValue: 'Email chưa xác thực — bạn cần xác thực để đặt tour.' }) as string}{' '}
      {sent ? (
        <span className="font-semibold">
          {t('auth.verifyResent', { defaultValue: 'Nếu email chưa xác thực, link mới đang được gửi.' }) as string}
        </span>
      ) : (
        <button
          type="button"
          disabled={sending}
          onClick={() => {
            setSending(true);
            api
              .post('/auth/resend-verification', { email: user.email })
              .then(() => setSent(true))
              .catch((err) => toast.error(apiErrorMessage(err, t('tours.loadError') as string)))
              .finally(() => setSending(false));
          }}
          className="font-semibold underline disabled:opacity-60"
        >
          {sending
            ? '…'
            : (t('auth.verifyResend', { defaultValue: 'Gửi lại link' }) as string)}
        </button>
      )}{' '}
      <Link to="/verify-email" className="font-semibold underline">Xác thực</Link>
    </div>
  );
}
