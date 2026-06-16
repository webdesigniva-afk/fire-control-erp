"use client";

import Link from "next/link";
import { QrScannerButton } from "./qr-scanner";

const actions = [
  { label: "Сканирай QR", scanner: true },
  { label: "Нов протокол", href: "/protocols/new" },
  { label: "Нов обект", href: "/locations/new" },
  { label: "Маршрут" },
];

const actionClassName =
  "rounded-xl border border-slate-200 bg-white p-4 text-sm font-bold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 hover:shadow-md active:translate-y-0";

export function QuickActions() {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[var(--shadow-soft)]">
      <h2 className="text-lg font-black">Бързи действия</h2>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {actions.map((action) =>
          action.scanner ? (
            <QrScannerButton
              key={action.label}
              buttonClassName={actionClassName}
            >
              {action.label}
            </QrScannerButton>
          ) : action.href ? (
            <Link
              key={action.label}
              href={action.href}
              className={actionClassName}
            >
              {action.label}
            </Link>
          ) : (
            <button key={action.label} className={actionClassName}>
              {action.label}
            </button>
          )
        )}
      </div>
    </div>
  );
}
