import { Pager } from '../../components/ui/kit';
import type { Pagination } from '../../types';

/** Back-compat alias: all pagination now shares the kit Pager. */
export function AdminPagination({ pagination, onPage }: { pagination: Pagination | null; onPage: (page: number) => void }) {
  return <Pager pagination={pagination} onPage={onPage} />;
}
