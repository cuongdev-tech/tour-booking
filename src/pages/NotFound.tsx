import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Compass } from 'lucide-react';
import { Button, EmptyState, PageContainer } from '../components/ui/kit';
import { useDocumentMeta } from '../hooks/useDocumentMeta';

export function NotFound() {
  const { t } = useTranslation();
  useDocumentMeta(t('notFound.title'));
  return (
    <PageContainer className="py-8 md:py-10">
      <EmptyState
        icon={<Compass className="h-6 w-6" aria-hidden />}
        title={t('notFound.title')}
        hint={t('notFound.hint')}
        action={<Link to="/"><Button>{t('bookingSuccess.home')}</Button></Link>}
      />
    </PageContainer>
  );
}
