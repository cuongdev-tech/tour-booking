import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api, apiErrorMessage } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useEnumLabels } from '../../i18n/enums';
import type { Pagination, User } from '../../types';
import { Badge, RowAction, TableCard, TableEmpty, Td, Th } from '../../components/ui/kit';
import { AdminPagination } from './Pagination';

export function UsersManage() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const labels = useEnumLabels();
  const [users, setUsers] = useState<User[]>([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination | null>(null);

  const load = (p: number = page) =>
    api
      .get('/admin/users', { params: { page: p, limit: 10 } })
      .then((r) => {
        setUsers(r.data.data);
        setPagination(r.data.pagination);
      })
      .catch((err) => toast.error(apiErrorMessage(err, t('adminUsers.loadFailed'))));
  useEffect(() => { void load(page); }, [page]);

  const update = async (id: string, data: { role?: string; status?: string }) => {
    // Never allow acting on your own account (prevents locking yourself out).
    if (currentUser && id === currentUser.id) {
      toast.error(t('adminUsers.selfActionForbidden'));
      return;
    }
    try {
      await api.patch(`/admin/users/${id}`, data);
      toast.success(t('adminUsers.updated'));
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, t('adminUsers.updateFailed')));
    }
  };

  return (
    <div>
    <TableCard>
      <table className="w-full min-w-170 text-left">
        <thead className="bg-slate-50">
          <tr><Th>{t('adminUsers.user')}</Th><Th>{t('adminUsers.role')}</Th><Th>{t('adminUsers.status')}</Th><Th right>{t('admin.actions')}</Th></tr>
        </thead>
        <tbody>
          {users.length === 0 && (
            <TableEmpty colSpan={4}>{t('tours.emptyTitle')}</TableEmpty>
          )}
          {users.map((u) => (
            <tr key={u.id} className="transition-colors hover:bg-slate-50/60">
              <Td><p className="font-medium text-slate-900">{u.name}</p><p className="mt-0.5 text-xs text-slate-400">{u.email}</p></Td>
              <Td><Badge className={u.role === 'ADMIN' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}>{labels.role(u.role)}</Badge></Td>
              <Td><Badge className={u.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}>{labels.userStatus(u.status)}</Badge></Td>
              <Td right>
                <span className="inline-flex items-center gap-1">
                  <RowAction disabled={currentUser?.id === u.id} onClick={() => void update(u.id, { role: u.role === 'ADMIN' ? 'CUSTOMER' : 'ADMIN' })}>
                    {u.role === 'ADMIN' ? t('adminUsers.makeCustomer') : t('adminUsers.makeAdmin')}
                  </RowAction>
                  <RowAction tone="red" disabled={currentUser?.id === u.id} onClick={() => void update(u.id, { status: u.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })}>
                    {u.status === 'ACTIVE' ? t('adminUsers.disable') : t('adminUsers.enable')}
                  </RowAction>
                </span>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableCard>
    <AdminPagination pagination={pagination} onPage={setPage} />
    </div>
  );
}
