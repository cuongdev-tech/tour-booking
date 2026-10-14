import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api, apiErrorMessage } from '../../services/api';
import { Button, Card, Field, Input, Select, TableCard, TableEmpty, Td, Th } from '../../components/ui/kit';

interface Guide { id: string; name: string; phone: string | null; active: boolean; }
interface Vehicle { id: string; plate: string; type: string; seats: number; active: boolean; }

export function FleetManage() {
  const [guides, setGuides] = useState<Guide[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [gName, setGName] = useState('');
  const [gPhone, setGPhone] = useState('');
  const [vPlate, setVPlate] = useState('');
  const [vType, setVType] = useState('Bus');
  const [vSeats, setVSeats] = useState(29);

  const load = () => {
    api.get('/admin/guides').then((r) => setGuides(r.data.data)).catch(() => undefined);
    api.get('/admin/vehicles').then((r) => setVehicles(r.data.data)).catch(() => undefined);
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <Card className="p-5">
        <h2 className="font-bold">Hướng dẫn viên</h2>
        <div className="mt-3 flex gap-2">
          <Input value={gName} onChange={(e) => setGName(e.target.value)} placeholder="Tên HDV" aria-label="Tên HDV" />
          <Input value={gPhone} onChange={(e) => setGPhone(e.target.value)} placeholder="SĐT" aria-label="SĐT" className="max-w-36" />
          <Button
            onClick={() => {
              if (!gName.trim()) {
                toast.error('Nhập tên HDV');
                return;
              }
              api.post('/admin/guides', { name: gName.trim(), phone: gPhone.trim() || undefined })
                .then(() => { setGName(''); setGPhone(''); load(); toast.success('Đã thêm HDV'); })
                .catch((err) => toast.error(apiErrorMessage(err)));
            }}
          >
            Thêm
          </Button>
        </div>
        <TableCard className="mt-4">
          <thead><tr><Th>Tên</Th><Th>SĐT</Th><Th>Trạng thái</Th><Th><span className="sr-only">Thao tác</span></Th></tr></thead>
          <tbody>
            {guides.map((g) => (
              <tr key={g.id} className="border-t border-slate-100">
                <Td className="font-medium">{g.name}</Td>
                <Td>{g.phone ?? '—'}</Td>
                <Td>{g.active ? 'Hoạt động' : 'Tắt'}</Td>
                <Td className="text-right">
                  <button type="button" onClick={() => { api.patch(`/admin/guides/${g.id}`, { active: !g.active }).then(load).catch((err) => toast.error(apiErrorMessage(err))); }} className="text-xs font-semibold text-orange-700 underline">Đảo trạng thái</button>{' '}
                  <button type="button" onClick={() => { api.delete(`/admin/guides/${g.id}`).then(load).catch((err) => toast.error(apiErrorMessage(err))); }} className="text-xs font-semibold text-red-600 underline">Xóa</button>
                </Td>
              </tr>
            ))}
            {guides.length === 0 && <TableEmpty colSpan={4}>Chưa có HDV</TableEmpty>}
          </tbody>
        </TableCard>
      </Card>
      <Card className="p-5">
        <h2 className="font-bold">Xe</h2>
        <div className="mt-3 flex gap-2">
          <Input value={vPlate} onChange={(e) => setVPlate(e.target.value.toUpperCase())} placeholder="BKS 51B-..." aria-label="Biển số" className="uppercase" />
          <Select value={vType} onChange={(e) => setVType(e.target.value)} className="max-w-32" aria-label="Loại xe">
            {['Bus', 'Coach', 'PrivateCar', 'LocalTransfer', 'Cruise', 'Flight'].map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
          <Input type="number" min={1} max={100} value={vSeats} onChange={(e) => setVSeats(Number(e.target.value))} aria-label="Số ghế" className="max-w-24" />
          <Button
            onClick={() => {
              if (vPlate.trim().length < 3 || !Number.isFinite(vSeats) || vSeats < 1) {
                toast.error('Biển số và số ghế chưa hợp lệ');
                return;
              }
              api.post('/admin/vehicles', { plate: vPlate.trim(), type: vType, seats: Math.floor(vSeats) })
                .then(() => { setVPlate(''); load(); toast.success('Đã thêm xe'); })
                .catch((err) => toast.error(apiErrorMessage(err)));
            }}
          >
            Thêm
          </Button>
        </div>
        <TableCard className="mt-4">
          <thead><tr><Th>Biển số</Th><Th>Loại</Th><Th>Ghế</Th><Th><span className="sr-only">Thao tác</span></Th></tr></thead>
          <tbody>
            {vehicles.map((v) => (
              <tr key={v.id} className="border-t border-slate-100">
                <Td className="font-mono font-bold">{v.plate}</Td>
                <Td>{v.type}</Td>
                <Td className="tabular-nums">{v.seats} {v.active ? '' : '(tắt)'}</Td>
                <Td className="text-right">
                  <button type="button" onClick={() => { api.patch(`/admin/vehicles/${v.id}`, { active: !v.active }).then(load).catch((err) => toast.error(apiErrorMessage(err))); }} className="text-xs font-semibold text-orange-700 underline">Đảo trạng thái</button>{' '}
                  <button type="button" onClick={() => { api.delete(`/admin/vehicles/${v.id}`).then(load).catch((err) => toast.error(apiErrorMessage(err))); }} className="text-xs font-semibold text-red-600 underline">Xóa</button>
                </Td>
              </tr>
            ))}
            {vehicles.length === 0 && <TableEmpty colSpan={4}>Chưa có xe</TableEmpty>}
          </tbody>
        </TableCard>
      </Card>
      <Field label="Ghi chú"><Input value="" onChange={() => undefined} placeholder="Gán xe/HDV ở màn Tours → ngày khởi hành" aria-label="note" /></Field>
    </div>
  );
}
