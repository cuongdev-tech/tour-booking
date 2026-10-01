import { useEffect, useState } from 'react';
import { Button, Modal } from '../ui/kit';

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) setBusy(false);
  }, [open ]);
  // Cancel/Escape/overlay always stay available, even mid-request: the async
  // work runs to completion in the background (its toast still reports the
  // outcome), so a hung network can never trap the dialog open.
  const cancel = () => {
    setBusy(false);
    onClose();
  };
  return (
    <Modal open={open} onClose={cancel} label={title}>
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed break-words text-slate-600">{message}</p>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={cancel} className="w-full sm:w-auto">
          {cancelLabel}
        </Button>
        <Button
          variant="danger"
          isLoading={busy}
          onClick={() => {
            setBusy(true);
            onConfirm();
          }}
          className="w-full sm:w-auto"
        >
          {busy ? `${confirmLabel}…` : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
