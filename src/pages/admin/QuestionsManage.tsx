import { useState } from 'react';
import { toast } from 'sonner';
import { api, apiErrorMessage } from '../../services/api';
import { formatDateTimeStr } from '../../i18n/format';
import type { TourQuestion } from '../../types';
import { Button, Card, Field, Input, RowAction, Textarea } from '../../components/ui/kit';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';

export function QuestionsManage() {
  const [tourId, setTourId] = useState('');
  const [questions, setQuestions] = useState<TourQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = () => {
    if (!tourId.trim()) {
      toast.error('Nhập tourId để tải câu hỏi');
      return;
    }
    setLoading(true);
    api
      .get(`/tours/${tourId.trim()}/questions`)
      .then((r) => {
        setQuestions(r.data.data ?? r.data.questions ?? []);
        setAnswers({});
      })
      .catch((err) => toast.error(apiErrorMessage(err, 'Không tải được câu hỏi')))
      .finally(() => setLoading(false));
  };

  const saveAnswer = async (id: string) => {
    const answer = (answers[id] ?? '').trim();
    try {
      // answer: null clears the admin answer.
      await api.patch(`/admin/questions/${id}/answer`, { answer: answer ? answer : null });
      toast.success('Đã lưu trả lời');
      setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, answer: answer ? answer : null } : q)));
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Lưu trả lời thất bại'));
    }
  };

  const toggleHide = async (q: TourQuestion) => {
    try {
      await api.patch(`/admin/questions/${q.id}/hide`, { hidden: !q.hidden });
      toast.success(q.hidden ? 'Đã hiện câu hỏi' : 'Đã ẩn câu hỏi');
      setQuestions((prev) => prev.map((x) => (x.id === q.id ? { ...x, hidden: !x.hidden } : x)));
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Cập nhật thất bại'));
    }
  };

  const remove = async (id: string) => {
    try {
      await api.delete(`/admin/questions/${id}`);
      toast.success('Đã xóa câu hỏi');
      setDeleteId(null);
      setQuestions((prev) => prev.filter((q) => q.id !== id));
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Xóa thất bại'));
      setDeleteId(null);
    }
  };

  return (
    <div>
      <Card className="p-5 sm:p-6">
        <h2 className="font-semibold tracking-tight text-slate-900">Hỏi đáp theo tour</h2>
        <p className="mt-1 text-xs text-slate-500">Chưa có API liệt kê toàn bộ câu hỏi — nhập tourId để tải GET /tours/:tourId/questions rồi trả lời / ẩn / xóa tại đó.</p>
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
        >
          <div className="flex-1">
            <Field label="Tour ID">
              <Input value={tourId} onChange={(e) => setTourId(e.target.value)} placeholder="Nhập tour id..." autoComplete="off" />
            </Field>
          </div>
          <Button type="submit">Tải câu hỏi</Button>
        </form>
      </Card>

      <div className="mt-4 space-y-4">
        {loading && <p className="text-sm text-slate-500">Đang tải...</p>}
        {!loading && questions.length === 0 && tourId.trim() !== '' && (
          <p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">Chưa có câu hỏi nào cho tour này.</p>
        )}
        {questions.map((q) => (
          <article key={q.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-soft sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">{q.question}</p>
              <p className="whitespace-nowrap text-xs tabular-nums text-slate-400">
                {formatDateTimeStr(q.createdAt)} · {q.user?.name ?? 'Khách'} {q.hidden ? '· Đang ẩn' : ''}
              </p>
            </div>
            {q.answer && (
              <div className="mt-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Trả lời</p>
                <p className="mt-1">{q.answer}</p>
              </div>
            )}
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Textarea
                value={answers[q.id] ?? q.answer ?? ''}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                placeholder="Nhập câu trả lời... (để trống + Lưu = xóa trả lời)"
                rows={2}
                className="flex-1"
                aria-label={`Trả lời cho: ${q.question}`}
              />
              <div className="flex shrink-0 flex-row gap-1 sm:flex-col">
                <RowAction onClick={() => void saveAnswer(q.id)}>Lưu TL</RowAction>
                <RowAction onClick={() => void toggleHide(q)}>{q.hidden ? 'Hiện' : 'Ẩn'}</RowAction>
                <RowAction tone="red" onClick={() => setDeleteId(q.id)}>Xóa</RowAction>
              </div>
            </div>
          </article>
        ))}
      </div>

      <ConfirmDialog
        open={deleteId !== null}
        title="Xóa câu hỏi?"
        message="Không thể hoàn tác."
        confirmLabel="Xóa"
        cancelLabel="Hủy"
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && void remove(deleteId)}
      />
    </div>
  );
}
