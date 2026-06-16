"use client";

import { AlertTriangle, Trash2, X } from "lucide-react";
import { Button } from "./button";

export type DeleteConfirmDialogState = {
  title?: string;
  itemLabel: string;
  details?: string;
  onConfirm: () => void | Promise<void>;
};

type DeleteConfirmDialogProps = {
  dialog: DeleteConfirmDialogState | null;
  busy?: boolean;
  onCancel: () => void;
};

export function DeleteConfirmDialog({
  dialog,
  busy = false,
  onCancel,
}: DeleteConfirmDialogProps) {
  if (!dialog) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-confirm-title"
        aria-describedby="delete-confirm-description"
        className="w-full max-w-md rounded-2xl border border-red-100 bg-white p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-600">
              <AlertTriangle size={20} />
            </span>
            <div>
              <h2 id="delete-confirm-title" className="text-lg font-black text-slate-950">
                {dialog.title ?? "Потвърждение за изтриване"}
              </h2>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onCancel}
            disabled={busy}
            aria-label="Отказ"
          >
            <X size={18} />
          </Button>
        </div>

        <p id="delete-confirm-description" className="mt-4 text-sm leading-6 text-slate-600">
          Сигурни ли сте, че искате да изтриете "{dialog.itemLabel}" завинаги?
        </p>
        {dialog.details ? (
          <p className="mt-2 text-sm leading-6 text-slate-500">{dialog.details}</p>
        ) : null}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Отказ
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={dialog.onConfirm}
            disabled={busy}
          >
            <Trash2 size={16} />
            {busy ? "Изтриване..." : "Изтрий"}
          </Button>
        </div>
      </div>
    </div>
  );
}
