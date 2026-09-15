import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarCheck, Compass, Tag, Users } from 'lucide-react';
import { Button, Card } from '../components/ui/kit';

export function About() {
  const { t } = useTranslation();
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
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-3xl font-bold text-slate-900">{t('about.title')}</h1>
        <p className="mt-4 leading-relaxed text-slate-600">{t('about.text')}</p>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {features.map((f) => (
          <Card key={f.title} className="p-6">
            <f.icon className="h-7 w-7 text-teal-600" />
            <h2 className="mt-3 font-semibold text-slate-900">{f.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{f.text}</p>
          </Card>
        ))}
      </div>

      <div className="mt-12">
        <h2 className="text-center text-xl font-bold text-slate-900">{t('about.stepsTitle')}</h2>
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          {steps.map((s) => (
            <Card key={s.n} className="p-6 text-center">
              <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-teal-600 text-base font-bold text-white">
                {s.n}
              </span>
              <h3 className="mt-3 font-semibold text-slate-900">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{s.text}</p>
            </Card>
          ))}
        </div>
      </div>

      <div className="mt-10 text-center">
        <Link to="/tours"><Button className="px-8 py-3">{t('about.explore')}</Button></Link>
      </div>
    </div>
  );
}
