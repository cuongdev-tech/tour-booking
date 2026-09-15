import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/kit';
import type { Pagination } from '../../types';

export function AdminPagination({ pagination, onPage }: { pagination: Pagination | null; onPage: (page: number) => void }) {
  const { t } = useTranslation();
  if (!pagination || pagination.totalPages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-center gap-2">
      <Button variant="secondary" disabled={pagination.page <= 1} onClick={() => onPage(pagination.page - 1)}>
        {t('tours.previous')}
      </Button>
      <span className="text-sm text-slate-500">{t('tours.pageOf', { page: pagination.page, pages: pagination.totalPages })}</span>
      <Button variant="secondary" disabled={pagination.page >= pagination.totalPages} onClick={() => onPage(pagination.page + 1)}>
        {t('tours.next')}
      </Button>
    </div>
  );
}
