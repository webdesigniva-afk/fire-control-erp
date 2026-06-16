"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  Clock3,
  Loader2,
  Plus,
  RefreshCw,
} from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { DashboardMap } from "../../components/dashboard-map";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import {
  OBJECT_STATUS_OK,
  OBJECT_STATUS_OVERDUE,
  OBJECT_STATUS_UPCOMING,
  type MapObjectsData,
  loadMapObjectsData,
} from "../../lib/map-objects";

type LoadState = "loading" | "ready" | "error";
type MapFilter = "all" | "ok" | "upcoming" | "overdue";

const emptyMapData: MapObjectsData = {
  locations: [],
  mapObjects: [],
  missingCoordinates: [],
  upcomingVisitCount: 0,
};

export default function MapPage() {
  const [mapData, setMapData] = useState<MapObjectsData>(emptyMapData);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [activeFilter, setActiveFilter] = useState<MapFilter>("all");

  const metrics = useMemo(() => {
    const ok = mapData.mapObjects.filter(
      (object) => object.status === OBJECT_STATUS_OK
    ).length;
    const upcoming = mapData.mapObjects.filter(
      (object) => object.status === OBJECT_STATUS_UPCOMING
    ).length;
    const overdue = mapData.mapObjects.filter(
      (object) => object.status === OBJECT_STATUS_OVERDUE
    ).length;

    return {
      total: mapData.locations.length,
      mapped: mapData.mapObjects.length,
      ok,
      upcoming,
      overdue,
    };
  }, [mapData]);

  const visibleObjects = useMemo(() => {
    if (activeFilter === "ok") {
      return mapData.mapObjects.filter(
        (object) => object.status === OBJECT_STATUS_OK
      );
    }

    if (activeFilter === "upcoming") {
      return mapData.mapObjects.filter(
        (object) => object.status === OBJECT_STATUS_UPCOMING
      );
    }

    if (activeFilter === "overdue") {
      return mapData.mapObjects.filter(
        (object) => object.status === OBJECT_STATUS_OVERDUE
      );
    }

    return mapData.mapObjects;
  }, [activeFilter, mapData.mapObjects]);

  const overdueTone =
    metrics.overdue > 0
      ? {
          value: "text-red-700",
          icon: "bg-red-50 text-red-700 ring-red-200",
          note: "Минала дата или проблемен статус",
        }
      : {
          value: "text-slate-700",
          icon: "bg-slate-50 text-slate-600 ring-slate-200",
          note: "Няма критични обекти",
        };

  async function refreshLocations() {
    setLoadState("loading");
    setErrorMessage("");

    try {
      setMapData(await loadMapObjectsData());
      setLoadState("ready");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Картата не можа да се зареди."
      );
      setLoadState("error");
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshLocations();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <AppShell
      title="Карта на обектите"
      description=""
      headerAction={
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={refreshLocations}>
            <RefreshCw className="h-4 w-4" />
            Обнови
          </Button>
          <Link
            href="/locations/new"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-600 via-red-500 to-orange-400 px-5 text-sm font-black text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <Plus className="h-4 w-4" />
            Нов обект
          </Link>
        </div>
      }
    >
      <div className="space-y-4">
        {loadState === "loading" ? (
          <Card className="flex items-center gap-3 p-5 text-sm font-bold text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
            Зареждане на обектите от Supabase...
          </Card>
        ) : null}

        {loadState === "error" ? (
          <Card className="border-red-200 bg-red-50 p-5 text-sm font-bold text-red-700">
            {errorMessage}
          </Card>
        ) : null}

        <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Card className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase text-slate-400">
                  Общо обекти
                </div>
                <div className="mt-1 text-2xl font-black text-slate-950">
                  {metrics.total}
                </div>
                <div className="mt-0.5 text-xs font-bold text-slate-500">
                  Активни в системата
                </div>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-700 ring-1 ring-slate-200">
                <Building2 className="h-4 w-4" />
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase text-slate-400">
                  Предстоящи проверки
                </div>
                <div className="mt-1 text-2xl font-black text-orange-700">
                  {metrics.upcoming}
                </div>
                <div className="mt-0.5 text-xs font-bold text-slate-500">
                  В следващите 30 дни
                </div>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-700 ring-1 ring-orange-200">
                <Clock3 className="h-4 w-4" />
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase text-slate-400">
                  Просрочени / проблемни
                </div>
                <div className={`mt-1 text-2xl font-black ${overdueTone.value}`}>
                  {metrics.overdue}
                </div>
                <div className="mt-0.5 text-xs font-bold text-slate-500">
                  {overdueTone.note}
                </div>
              </div>
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${overdueTone.icon}`}>
                <AlertTriangle className="h-4 w-4" />
              </div>
            </div>
          </Card>
        </section>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {[
              {
                value: "all" as const,
                label: "Всички",
                count: metrics.mapped,
                activeClassName: "border-slate-300 bg-slate-900 text-white",
              },
              {
                value: "ok" as const,
                label: "Изрядни",
                count: metrics.ok,
                activeClassName: "border-green-300 bg-green-50 text-green-700",
              },
              {
                value: "upcoming" as const,
                label: "Предстоящи",
                count: metrics.upcoming,
                activeClassName: "border-orange-300 bg-orange-50 text-orange-700",
              },
              {
                value: "overdue" as const,
                label: "Просрочени",
                count: metrics.overdue,
                activeClassName:
                  metrics.overdue > 0
                    ? "border-red-300 bg-red-50 text-red-700"
                    : "border-slate-300 bg-slate-50 text-slate-600",
              },
            ].map((filter) => {
              const active = activeFilter === filter.value;

              return (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setActiveFilter(filter.value)}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-black transition ${
                    active
                      ? filter.activeClassName
                      : "border-slate-200 bg-white text-slate-600 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                  }`}
                >
                  {filter.label}
                  <span className="font-black opacity-70">{filter.count}</span>
                </button>
              );
            })}
          </div>

          {mapData.missingCoordinates.length ? (
            <Badge variant="warning">
              {mapData.missingCoordinates.length} обекта не се показват на картата
              (липсват координати)
            </Badge>
          ) : null}
        </div>

        <DashboardMap
          objects={visibleObjects}
          showOpenMapLink={false}
          prominent
        />
      </div>
    </AppShell>
  );
}
