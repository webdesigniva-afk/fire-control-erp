"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import type { DashboardMapObject } from "./dashboard-map-leaflet";

const mapLegendItems = [
  {
    label: "Над 30 дни",
    className: "bg-green-500 ring-green-100",
  },
  {
    label: "8-30 дни",
    className: "bg-orange-400 ring-orange-100",
  },
  {
    label: "До 7 дни",
    className: "bg-red-500 ring-red-100",
  },
];

type DashboardMapProps = {
  objects: DashboardMapObject[];
  totalObjects?: number;
  showOpenMapLink?: boolean;
  prominent?: boolean;
};

const DashboardMapLeaflet = dynamic(
  () => import("./dashboard-map-leaflet").then((mod) => mod.DashboardMapLeaflet),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-slate-100 text-sm font-bold text-slate-400">
        Зареждане на картата...
      </div>
    ),
  }
);

export function DashboardMap({
  objects,
  totalObjects = objects.length,
  showOpenMapLink = true,
  prominent = false,
}: DashboardMapProps) {
  return (
    <div
      className={`rounded-2xl border border-slate-200/80 bg-white shadow-[var(--shadow-soft)] ${
        prominent ? "p-4 shadow-[var(--shadow-lift)]" : "p-5"
      }`}
    >
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h2 className="text-lg font-black">Карта на обектите</h2>
            <span className="text-xs font-medium text-slate-400">
              {objects.length}/{totalObjects} обекта показани
            </span>
          </div>
          <p className="text-sm text-slate-500">
            Реални обекти с въведени координати
          </p>
        </div>
        {showOpenMapLink ? (
          <Link
            href="/map"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 shadow-sm transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 hover:shadow-md"
          >
            Отвори карта
          </Link>
        ) : null}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-black text-slate-600">
        {mapLegendItems.map((item) => (
          <div
            key={item.label}
            className="inline-flex h-7 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 shadow-sm"
          >
            <span
              className={`h-3 w-3 rounded-full border-2 border-white shadow-sm ring-2 ${item.className}`}
            />
            {item.label}
          </div>
        ))}
      </div>

      <div
        className={`relative isolate overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-inner ${
          prominent ? "h-[420px] sm:h-[560px]" : "h-[360px] sm:h-[430px]"
        }`}
      >
        {objects.length ? (
          <DashboardMapLeaflet objects={objects} />
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm font-bold text-slate-400">
            Няма обекти с координати за показване на картата.
          </div>
        )}
      </div>
    </div>
  );
}
