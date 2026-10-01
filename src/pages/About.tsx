import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { ArrowRight, CalendarCheck, Compass, Tag, Users } from 'lucide-react';
import { toast } from 'sonner';
import { api, apiErrorMessage } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Button, Card, Field, Input, PageContainer, SectionHeader, Textarea } from '../components/ui/kit';
import { useDocumentMeta } from '../hooks/useDocumentMeta';

export function About() {
  const { t } = useTranslation();
  const { user } = useAuth();
  useDocumentMeta(t('about.title'), t('about.text'));
  const features = [
    { icon: Compass, title: t('about.f1Title'), text: t('about.f1Text') },
    { icon: Tag, title: t('about.f2Title'), text: t('about.f2Text') },
    { icon: CalendarCheck, title: t('about.f3Title'), text: t('about.f3Text') },
    { icon: Users, title: t('about.f4Title'), text: t('about.f4Text') },
  ];
  const steps = [
    { n: '1', title: t('about.s1Title'), text: t('about.s1Text') },
    { n: '2', title: t('about.s2Title'), text: t('about.s2Text') },
    { n: '3', title: t('about.s3Title'), text: t('about.s3Text') },
  ];
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const sendContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      name.trim().length < 2 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      (phone.trim() !== '' && !/^[0-9+\s-]{8,20}$/.test(phone.trim())) ||
      message.trim().length < 10
    ) {
      toast.error(apiErrorMessage(null, t('contact.sendFailed')));
      return;
    }
    setSending(true);
    try {
      await api.post('/contact', { name: name.trim(), email: email.trim(), phone: phone.trim() || undefined, message: message.trim() });
      setSent(true);
      setName('');
      setEmail('');
      setPhone('');
      setMessage('');
    } catch (err) {
      toast.error(apiErrorMessage(err, t('contact.sendFailed')));
    } finally {
      setSending(false);
    }
  };
  return (
    <PageContainer className="max-w-5xl py-12 md:py-16">
      <div className="mx-auto max-w-3xl text-center">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-orange-700">
          <Compass className="h-3.5 w-3.5" aria-hidden /> Tour Booking
        </p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">{t('about.title')}</h1>
        <p className="mt-4 leading-relaxed text-slate-600">{t('about.text')}</p>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 md:mt-12">
        {features.map((f) => (
          <Card key={f.title} className="p-6 transition-all hover:-translate-y-0.5 hover:shadow-lift">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 text-orange-700">
              <f.icon className="h-5 w-5" aria-hidden />
            </span>
            <h2 className="mt-4 font-semibold text-slate-900">{f.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{f.text}</p>
          </Card>
        ))}
      </div>

      <div className="mt-12 md:mt-14">
        <SectionHeader center title={t('about.stepsTitle')} />
        <ol className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          {steps.map((s) => (
            <Card key={s.n} as="li" className="p-6 text-center">
              <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-orange-700 text-base font-bold tabular-nums text-white shadow-sm" aria-hidden>
                {s.n}
              </span>
              <h3 className="mt-4 font-semibold text-slate-900">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{s.text}</p>
            </Card>
          ))}
        </ol>
      </div>

      <div className="mt-10 text-center md:mt-12">
        <Link to="/tours">
          <Button className="px-8 py-3">
            {t('about.explore')} <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        </Link>
      </div>

      {/* Contact form is customer-only: admins read and reply to messages at
          /admin/contact instead of sending them to themselves. */}
      {user?.role !== 'ADMIN' && (
      <div className="mt-12 md:mt-14">
        <SectionHeader center title={t('contact.title')} subtitle={t('contact.subtitle')} />
        <Card className="mx-auto mt-8 max-w-2xl p-6 sm:p-8">
          {sent ? (
            <div className="mt-6 text-center">
              <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm font-medium text-emerald-700">
                {t('contact.sent')}
              </p>
              <Button variant="ghost" onClick={() => setSent(false)} className="mt-3">
                {t('contact.send')}
              </Button>
            </div>
          ) : (
            <form onSubmit={(e) => void sendContact(e)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t('checkout.fullName')}>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('checkout.fullNamePlaceholder')} autoComplete="name" />
              </Field>
              <Field label={t('checkout.email')}>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" inputMode="email" autoComplete="email" />
              </Field>
              <Field label={t('checkout.phone')}>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0901234567" inputMode="tel" autoComplete="tel" />
              </Field>
              <div className="sm:col-span-2">
                <Field label={t('contact.message')}>
                  <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} maxLength={2000} placeholder={t('contact.messagePh')} />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" isLoading={sending} className="w-full py-3">{t('contact.send')}</Button>
              </div>
            </form>
          )}
        </Card>
      </div>
      )}
    </PageContainer>
  );
}
