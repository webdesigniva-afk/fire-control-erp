"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  Clock3,
  Loader2,
  MapPinned,
  Navigation,
  Route,
  X,
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
import {
  readServiceCenters,
  readServiceCentersFromSupabase,
  type ServiceCenterSetting,
} from "../../lib/settings";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";

type LoadState = "loading" | "ready" | "error";
type MapFilter = "all" | "ok" | "upcoming" | "overdue";

type RouteStop = {
  id: string;
  time: string;
  name: string;
  status: string;
  href: string;
  position?: [number, number];
};

type SavedRoutePlan = {
  serviceCenterId: string;
  serviceCenterName: string;
  stopIds: string[];
  updatedAt: string;
};

const routePlanSettingsKey = "firecontrol:logistics:route-plan";

const emptyMapData: MapObjectsData = {
  locations: [],
  mapObjects: [],
  missingCoordinates: [],
  upcomingVisitCount: 0,
};

const fallbackRouteStops: RouteStop[] = [
  {
    id: "fallback-mall",
    time: "09:30",
    name: "МОЛ Шумен",
    status: "планиран",
    href: "/locations",
  },
  {
    id: "fallback-warehouse",
    time: "11:00",
    name: "Склад Север",
    status: "следващ",
    href: "/locations",
  },
  {
    id: "fallback-hotel",
    time: "14:30",
    name: "Хотел Централ",
    status: "планиран",
    href: "/locations",
  },
];

function routePriority(status: string) {
  if (status === OBJECT_STATUS_OVERDUE) return 0;
  if (status === OBJECT_STATUS_UPCOMING) return 1;
  return 2;
}

function googleMapsRouteUrl(stops: RouteStop[]) {
  const points = stops
    .map((stop) =>
      stop.position
        ? `${stop.position[0]},${stop.position[1]}`
        : encodeURIComponent(stop.name)
    )
    .join("/");

  return `https://www.google.com/maps/dir/${encodeURIComponent("Офис/Сервиз")}/${points}`;
}

export default function MapPage() {
  const [mapData, setMapData] = useState<MapObjectsData>(emptyMapData);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [activeFilter, setActiveFilter] = useState<MapFilter>("all");
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [serviceCenters, setServiceCenters] = useState<ServiceCenterSetting[]>([]);
  const [plannedServiceCenterId, setPlannedServiceCenterId] = useState("");
  const [selectedServiceCenterId, setSelectedServiceCenterId] = useState("");
  const [plannedStopIds, setPlannedStopIds] = useState<string[]>([]);
  const [selectedStopIds, setSelectedStopIds] = useState<string[]>([]);
  const [routeSaving, setRouteSaving] = useState(false);
  const [routeMessage, setRouteMessage] = useState("");

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

  const routeCandidates = useMemo<RouteStop[]>(() => {
    return [...mapData.mapObjects]
      .sort((first, second) => {
        const priorityDiff = routePriority(first.status) - routePriority(second.status);
        if (priorityDiff !== 0) return priorityDiff;
        return first.name.localeCompare(second.name);
      })
      .map((object, index) => ({
        id: object.id,
        time: ["09:30", "11:00", "14:30"][index] ?? "16:00",
        name: object.name,
        status: object.status,
        href: object.href,
        position: object.position,
      }));
  }, [mapData.mapObjects]);

  const routeStops = useMemo<RouteStop[]>(() => {
    const candidates = routeCandidates.length ? routeCandidates : fallbackRouteStops;
    const selected = plannedStopIds.length
      ? plannedStopIds
          .map((id) => candidates.find((stop) => stop.id === id))
          .filter((stop): stop is RouteStop => Boolean(stop))
      : candidates.slice(0, 3);

    return selected.map((stop, index) => ({
      ...stop,
      time: ["09:30", "11:00", "14:30", "16:00", "17:30"][index] ?? stop.time,
    }));
  }, [plannedStopIds, routeCandidates]);

  const activeServiceCenter =
    serviceCenters.find((center) => center.id === plannedServiceCenterId) ??
    serviceCenters[0] ??
    null;

  const routeUrl = useMemo(() => googleMapsRouteUrl(routeStops), [routeStops]);

  const overdueTone =
    metrics.overdue > 0
      ? {
          value: "text-red-700",
          icon: "bg-red-50 text-red-700 ring-red-200",
          note: "Посещение до 7 дни или минала дата",
        }
      : {
          value: "text-slate-700",
          icon: "bg-slate-50 text-slate-600 ring-slate-200",
          note: "Няма обекти до 7 дни",
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

  useEffect(() => {
    async function loadRoutePlanning() {
      let centers = readServiceCenters().filter(
        (center) => center.active && !center.archivedAt
      );

      try {
        centers = (await readServiceCentersFromSupabase()).filter(
          (center) => center.active && !center.archivedAt
        );
      } catch {
        // Local settings are enough as fallback when Supabase settings are unavailable.
      }

      setServiceCenters(centers);
      const defaultServiceCenterId = centers[0]?.id ?? "";
      setPlannedServiceCenterId(defaultServiceCenterId);
      setSelectedServiceCenterId(defaultServiceCenterId);

      try {
        const supabase = createSupabaseBrowserClient();
        const { data, error } = await supabase
          .from("app_settings")
          .select("value")
          .eq("key", routePlanSettingsKey)
          .maybeSingle();

        if (error) throw new Error(error.message);
        const plan = (data as { value?: SavedRoutePlan } | null)?.value;
        if (!plan) return;

        const serviceCenterId =
          centers.find((center) => center.id === plan.serviceCenterId)?.id ??
          defaultServiceCenterId;

        setPlannedServiceCenterId(serviceCenterId);
        setSelectedServiceCenterId(serviceCenterId);
        setPlannedStopIds(Array.isArray(plan.stopIds) ? plan.stopIds : []);
        setSelectedStopIds(Array.isArray(plan.stopIds) ? plan.stopIds : []);
      } catch {
        // Route planning remains usable even if the saved plan is missing.
      }
    }

    void loadRoutePlanning();
  }, []);

  function openPlanner() {
    const currentStopIds = routeStops.map((stop) => stop.id);
    setSelectedServiceCenterId(plannedServiceCenterId || serviceCenters[0]?.id || "");
    setSelectedStopIds(currentStopIds);
    setRouteMessage("");
    setPlannerOpen(true);
  }

  function toggleRouteStop(stopId: string) {
    setSelectedStopIds((current) => {
      if (current.includes(stopId)) {
        return current.filter((id) => id !== stopId);
      }

      return [...current, stopId];
    });
  }

  async function saveRoutePlan() {
    const serviceCenter = serviceCenters.find(
      (center) => center.id === selectedServiceCenterId
    );
    const nextStopIds = selectedStopIds.length
      ? selectedStopIds
      : routeCandidates.slice(0, 3).map((stop) => stop.id);

    setRouteSaving(true);
    setRouteMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("app_settings").upsert(
        {
          key: routePlanSettingsKey,
          value: {
            serviceCenterId: serviceCenter?.id ?? "",
            serviceCenterName: serviceCenter?.name ?? "",
            stopIds: nextStopIds,
            updatedAt: new Date().toISOString(),
          } satisfies SavedRoutePlan,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );

      if (error) throw new Error(error.message);

      setPlannedServiceCenterId(serviceCenter?.id ?? "");
      setSelectedServiceCenterId(serviceCenter?.id ?? "");
      setPlannedStopIds(nextStopIds);
      setSelectedStopIds(nextStopIds);
      setRouteMessage("Маршрутът е запазен.");
      setPlannerOpen(false);
    } catch (error) {
      setRouteMessage(
        error instanceof Error ? error.message : "Маршрутът не беше запазен."
      );
    } finally {
      setRouteSaving(false);
    }
  }

  return (
    <AppShell
      title="Карта на обектите"
      description=""
      showSearch={false}
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
                  Между 8 и 30 дни
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
                  До 7 дни
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
                label: "До 7 дни",
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

        <Card className="p-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600 ring-1 ring-orange-100">
                  <Route className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-950">
                    Логистика за посещения
                  </h2>
                  <p className="text-sm font-semibold text-slate-500">
                    Дневен маршрут от Офис/Сервиз към обектите с най-близки проверки.
                  </p>
                  <div className="mt-2 text-xs font-black uppercase text-slate-400">
                    Сервиз:{" "}
                    <span className="text-slate-700">
                      {activeServiceCenter?.name || "не е избран"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-2 md:grid-cols-3">
                {routeStops.map((stop, index) => (
                  <a
                    key={`${stop.time}-${stop.name}`}
                    href={stop.href}
                    className="group rounded-2xl border border-slate-100 bg-slate-50 p-3 transition hover:border-orange-200 hover:bg-orange-50"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="rounded-xl bg-white px-2.5 py-1 text-xs font-black text-orange-700 shadow-sm">
                        {stop.time}
                      </span>
                      <Badge
                        variant={
                          stop.status === OBJECT_STATUS_OVERDUE
                            ? "danger"
                            : stop.status === OBJECT_STATUS_UPCOMING
                              ? "orange"
                              : "success"
                        }
                      >
                        {index === 0 ? "първи" : index === 1 ? "следващ" : "последен"}
                      </Badge>
                    </div>
                    <div className="mt-3 line-clamp-2 text-sm font-black text-slate-900 group-hover:text-orange-700">
                      {stop.name}
                    </div>
                    <div className="mt-1 text-xs font-bold text-slate-500">
                      {stop.status}
                    </div>
                  </a>
                ))}
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:w-56 xl:grid-cols-1">
              <Button type="button" onClick={openPlanner}>
                <Navigation size={16} />
                Планирай маршрут
              </Button>
              <a
                href={routeUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 shadow-sm transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
              >
                <MapPinned size={16} />
                Отвори маршрут
              </a>
            </div>
          </div>
        </Card>

        <DashboardMap
          objects={visibleObjects}
          showOpenMapLink={false}
          prominent
        />
      </div>

      {plannerOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-8 backdrop-blur-sm"
          onClick={(event) => {
            if (event.target === event.currentTarget) setPlannerOpen(false);
          }}
        >
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-lg font-black text-slate-950">
                  Планиране на маршрут
                </h2>
                <p className="mt-0.5 text-sm font-semibold text-slate-500">
                  Маршрут за сервиз от Офис/Сервиз по приоритетни обекти.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setPlannerOpen(false)}
              >
                <X size={16} />
              </Button>
            </div>

            <div className="space-y-4 p-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase text-slate-400">
                    Начална точка
                  </div>
                  <div className="mt-2 text-sm font-black text-slate-900">
                    Офис/Сервиз
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase text-slate-400">
                    Обекти
                  </div>
                  <div className="mt-2 text-sm font-black text-slate-900">
                    {routeStops.length}
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase text-slate-400">
                    Сервиз
                  </div>
                  <div className="mt-2 text-sm font-black text-slate-900">
                    {activeServiceCenter?.name || "Не е избран"}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <label className="space-y-2">
                  <span className="text-xs font-black uppercase text-slate-400">
                    Сервиз за маршрута
                  </span>
                  <select
                    value={selectedServiceCenterId}
                    onChange={(event) => setSelectedServiceCenterId(event.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 outline-none focus:border-orange-300 focus:ring-4 focus:ring-orange-100"
                  >
                    {serviceCenters.length ? (
                      serviceCenters.map((center) => (
                        <option key={center.id} value={center.id}>
                          {center.name}
                        </option>
                      ))
                    ) : (
                      <option value="">Няма активни сервизи</option>
                    )}
                  </select>
                </label>
                <Badge variant="neutral">
                  {selectedStopIds.length || routeStops.length} обекта
                </Badge>
              </div>

              <div className="space-y-2">
                {(routeCandidates.length ? routeCandidates : fallbackRouteStops).map((stop, index) => (
                  <button
                    type="button"
                    key={`planner-${stop.time}-${stop.name}`}
                    onClick={() => toggleRouteStop(stop.id)}
                    className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${
                      selectedStopIds.includes(stop.id)
                        ? "border-orange-200 bg-orange-50"
                        : "border-slate-100 bg-slate-50 hover:border-orange-100 hover:bg-orange-50/50"
                    }`}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-sm font-black text-orange-700 shadow-sm">
                      {selectedStopIds.includes(stop.id)
                        ? selectedStopIds.indexOf(stop.id) + 1
                        : index + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-black text-slate-900">
                        {stop.name}
                      </div>
                      <div className="text-xs font-bold text-slate-500">
                        {stop.time} · {stop.status}
                      </div>
                    </div>
                    <span
                      className={`h-5 w-5 rounded-md border ${
                        selectedStopIds.includes(stop.id)
                          ? "border-orange-500 bg-orange-500"
                          : "border-slate-300 bg-white"
                      }`}
                    />
                  </button>
                ))}
              </div>

              {routeMessage ? (
                <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                  {routeMessage}
                </div>
              ) : null}

              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPlannerOpen(false)}
                >
                  Затвори
                </Button>
                <Button
                  type="button"
                  onClick={saveRoutePlan}
                  disabled={routeSaving || !serviceCenters.length}
                >
                  <Navigation size={16} />
                  {routeSaving ? "Запис..." : "Запази маршрут"}
                </Button>
                <a
                  href={routeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-600 via-red-500 to-orange-400 px-4 text-sm font-black text-white shadow-[0_12px_26px_rgba(239,68,68,0.22)] transition hover:shadow-[0_16px_32px_rgba(239,68,68,0.28)]"
                >
                  <MapPinned size={16} />
                  Отвори в Google Maps
                </a>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
