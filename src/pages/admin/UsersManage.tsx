import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api, apiErrorMessage } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useEnumLabels } from '../../i18n/enums';
import type { Pagination, User } from '../../types';
import { Badge } from '../../components/ui/kit';
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
      .catch(() => toast.error(t('adminUsers.loadFailed')));
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
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err, t('adminUsers.updateFailed')));
    }
  };

  return (
    <div>
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full min-w-170 text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr><th className="px-4 py-3">{t('adminUsers.user')}</th><th className="px-4 py-3">{t('adminUsers.role')}</th><th className="px-4 py-3">{t('adminUsers.status')}</th><th className="px-4 py-3 text-right">{t('admin.actions')}</th></tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-t border-slate-100">
              <td className="px-4 py-3"><p className="font-medium">{u.name}</p><p className="text-xs text-slate-400">{u.email}</p></td>
              <td className="px-4 py-3"><Badge className={u.role === 'ADMIN' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}>{labels.role(u.role)}</Badge></td>
              <td className="px-4 py-3"><Badge className={u.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}>{labels.userStatus(u.status)}</Badge></td>
              <td className="px-4 py-3 text-right">
                <button disabled={currentUser?.id === u.id} onClick={() => void update(u.id, { role: u.role === 'ADMIN' ? 'CUSTOMER' : 'ADMIN' })} className="mr-3 font-semibold text-teal-700 hover:underline disabled:opacity-40 disabled:hover:no-underline">
                  {u.role === 'ADMIN' ? t('adminUsers.makeCustomer') : t('adminUsers.makeAdmin')}
                </button>
                <button disabled={currentUser?.id === u.id} onClick={() => void update(u.id, { status: u.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })} className="font-semibold text-red-600 hover:underline disabled:opacity-40 disabled:hover:no-underline">
                  {u.status === 'ACTIVE' ? t('adminUsers.disable') : t('adminUsers.enable')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <AdminPagination pagination={pagination} onPage={setPage} />
    </div>
  );
}
