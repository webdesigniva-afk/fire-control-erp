"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import type { DashboardMapObject } from "./dashboard-map-leaflet";

type DashboardMapProps = {
  objects: DashboardMapObject[];
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
          <h2 className="text-lg font-black">Карта на обектите</h2>
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

      <div
        className={`relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-inner ${
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
