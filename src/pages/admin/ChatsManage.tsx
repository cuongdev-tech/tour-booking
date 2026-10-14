import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api, apiErrorMessage } from '../../services/api';
import { formatDateTimeStr } from '../../i18n/format';
import type { BookingMessage, ChatThread } from '../../types';
import { Button, Card, Input } from '../../components/ui/kit';

export function ChatsManage() {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<BookingMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadThreads = () => {
    api
      .get('/admin/chats/threads')
      .then((r) => setThreads(r.data.data ?? []))
      .catch((err) => toast.error(apiErrorMessage(err, 'Không tải được hội thoại')));
  };

  useEffect(() => {
    loadThreads();
  }, []);

  const openThread = (bookingId: string) => {
    setActiveId(bookingId);
    setMessages([]);
    api
      .get(`/bookings/${bookingId}/messages`)
      .then((r) => setMessages(r.data.data ?? r.data.messages ?? []))
      .catch((err) => toast.error(apiErrorMessage(err, 'Không tải được tin nhắn')));
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  const send = async () => {
    if (!activeId || !draft.trim() || sending) return;
    setSending(true);
    try {
      const { data } = await api.post(`/bookings/${activeId}/messages`, { body: draft.trim() });
      const msg = (data.message ?? data) as BookingMessage;
      if (msg?.id) setMessages((prev) => [...prev, msg]);
      else {
        // Fallback: refetch when the backend returns no message body.
        const r = await api.get(`/bookings/${activeId}/messages`);
        setMessages(r.data.data ?? r.data.messages ?? []);
      }
      setDraft('');
      loadThreads();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Gửi tin nhắn thất bại'));
    } finally {
      setSending(false);
    }
  };

  const active = threads.find((t) => t.bookingId === activeId);

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
      <Card className="max-h-140 overflow-y-auto p-3 lg:col-span-1">
        <h2 className="px-2 py-1 text-sm font-bold uppercase tracking-wide text-slate-500">Hội thoại ({threads.length})</h2>
        {threads.length === 0 && <p className="p-3 text-sm text-slate-400">Chưa có hội thoại nào.</p>}
        {threads.map((t) => (
          <button
            key={t.bookingId}
            type="button"
            onClick={() => openThread(t.bookingId)}
            aria-pressed={activeId === t.bookingId}
            className={`mt-1 flex w-full flex-col gap-0.5 rounded-xl p-3 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 ${
              activeId === t.bookingId ? 'bg-orange-50 ring-1 ring-orange-200' : 'hover:bg-slate-50'
            }`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="font-mono font-bold text-slate-900">{t.bookingCode}</span>
              {t.lastAt && <span className="text-[11px] tabular-nums text-slate-400">{formatDateTimeStr(t.lastAt)}</span>}
            </span>
            <span className="truncate text-xs text-slate-500">{t.tour?.title ?? ''} · {t.customer?.name ?? ''}</span>
            {t.lastMessage && (
              <span className="line-clamp-1 text-[13px] text-slate-600">
                {typeof t.lastMessage === 'string' ? t.lastMessage : t.lastMessage.body}
              </span>
            )}
          </button>
        ))}
      </Card>

      <Card className="flex min-h-120 flex-col p-4 sm:p-5 lg:col-span-2">
        {!activeId ? (
          <p className="m-auto text-sm text-slate-400">Chọn một hội thoại để chat 2 chiều.</p>
        ) : (
          <>
            <h2 className="font-semibold text-slate-900">
              {active?.bookingCode ?? activeId}
              {active?.tour?.title && <span className="ml-2 text-sm font-normal text-slate-500">{active.tour.title}</span>}
            </h2>
            <div className="mt-3 max-h-100 flex-1 space-y-2 overflow-y-auto rounded-xl bg-slate-50 p-3" role="log" aria-live="polite">
              {messages.length === 0 && <p className="text-center text-xs text-slate-400">Chưa có tin nhắn.</p>}
              {messages.map((m) => {
                const mine = m.senderRole === 'ADMIN';
                return (
                  <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm ${mine ? 'bg-orange-700 text-white' : 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-100'}`}>
                      <p>{m.body}</p>
                      <p className={`mt-1 text-[11px] tabular-nums ${mine ? 'text-orange-100' : 'text-slate-400'}`}>
                        {m.sender?.name ?? ''} · {formatDateTimeStr(m.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Nhắn cho khách..."
                aria-label="Nhắn cho khách"
                className="flex-1"
              />
              <Button type="submit" isLoading={sending}>Gửi</Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
