"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock3,
  Eye,
  Filter,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";
import { serviceTasksUpdatedEvent } from "../../lib/tasks";

type LocationStatus = "Изряден" | "Проблем" | "Просрочен" | "Неактивен";
type DataRecord = Record<string, unknown>;
type ObjectViewFilter = "all" | "active" | "expiring" | "overdue" | "defects";

type LocationListItem = {
  id: string;
  qrCode: string;
  name: string;
  objectType: string;
  address: string;
  status: LocationStatus;
  client: string;
  tasks: number;
  openDefects: number;
  nextVisitDate: string;
  hasOverdueAction: boolean;
  isExpiringSoon: boolean;
};

const statusVariant = {
  Изряден: "success",
  Проблем: "danger",
  Просрочен: "danger",
  Неактивен: "neutral",
} as const;

function textValue(record: DataRecord | null | undefined, keys: string[]) {
  if (!record) return "";

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }

  return "";
}

function inputDateToDate(value: string) {
  if (!value) return null;

  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;

  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date;
}

function daysUntil(value: string) {
  const date = inputDateToDate(value);
  if (!date) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / 86400000);
}

function formatDateValue(value: string) {
  if (!value) return "";
  if (!value.includes("-")) return value;

  const [year, month, day] = value.slice(0, 10).split("-");
  return day && month && year ? `${day}.${month}.${year}` : value;
}

function nextVisitLabel(value: string) {
  const days = daysUntil(value);
  if (!value || days === null) return "Няма планирано";
  if (days < 0) return "Просрочена";
  if (days === 0) return "Днес";
  if (days === 1) return "След 1 ден";
  return `След ${days} дни`;
}

function isInactiveLocation(row: DataRecord) {
  const status = textValue(row, ["status"]).toLowerCase();
  return (
    row["active"] === false ||
    row["archived"] === true ||
    row["inactive"] === true ||
    Boolean(textValue(row, ["archived_at", "deleted_at", "inactive_at"])) ||
    status.includes("неактив") ||
    status.includes("inactive") ||
    status.includes("archived")
  );
}

function taskMatchesLocation(task: DataRecord, keys: Set<string>) {
  return ["object_id", "object_code", "object_name"].some((key) =>
    keys.has(textValue(task, [key]))
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  note,
  tone,
}: {
  icon: typeof Building2;
  label: string;
  value: number;
  note: string;
  tone: "slate" | "green" | "orange" | "red";
}) {
  const toneClasses = {
    slate: "bg-slate-50 text-slate-700 ring-slate-200",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    orange: "bg-orange-50 text-orange-700 ring-orange-200",
    red: "bg-red-50 text-red-700 ring-red-200",
  };

  return (
    <div className="flex min-h-24 items-center gap-4 border-b border-slate-100 p-4 sm:border-b-0 sm:border-r last:border-b-0 last:border-r-0">
      <div
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ring-1 ${toneClasses[tone]}`}
      >
        <Icon size={22} />
      </div>
      <div className="min-w-0">
        <div className="text-xs font-black uppercase text-slate-400">
          {label}
        </div>
        <div className="mt-1 text-2xl font-black text-slate-950">{value}</div>
        <div className="mt-1 text-xs font-bold text-slate-500">{note}</div>
      </div>
    </div>
  );
}

export default function LocationsPage() {
  const [locations, setLocations] = useState<LocationListItem[]>([]);
  const [search, setSearch] = useState("");
  const [objectTypeFilter, setObjectTypeFilter] = useState("");
  const [viewFilter, setViewFilter] = useState<ObjectViewFilter>("all");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [deletingLocationId, setDeletingLocationId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const metrics = useMemo(() => {
    const total = locations.length;
    const active = locations.filter(
      (location) => location.status === "Изряден"
    ).length;
    const expiring = locations.filter((location) => location.isExpiringSoon).length;
    const overdue = locations.filter((location) => location.hasOverdueAction).length;
    const defects = locations.filter((location) => location.openDefects > 0).length;

    return { total, active, expiring, overdue, defects };
  }, [locations]);

  const filteredLocations = useMemo(() => {
    const query = search.trim().toLowerCase();

    return locations.filter((location) => {
      if (objectTypeFilter && location.objectType !== objectTypeFilter) {
        return false;
      }

      if (viewFilter === "active" && location.status !== "Изряден") return false;
      if (viewFilter === "expiring" && !location.isExpiringSoon) return false;
      if (viewFilter === "overdue" && !location.hasOverdueAction) return false;
      if (viewFilter === "defects" && location.openDefects === 0) return false;

      if (!query) return true;

      return [
        location.name,
        location.objectType,
        location.address,
        location.client,
        location.qrCode,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [locations, objectTypeFilter, search, viewFilter]);

  const objectTypeFilters = useMemo(
    () =>
      Array.from(
        new Set(locations.map((location) => location.objectType).filter(Boolean))
      ).sort((first, second) => first.localeCompare(second)),
    [locations]
  );

  async function loadLocations() {
    setLoadState("loading");
    setErrorMessage("");

    try {
      const supabase = createSupabaseBrowserClient();
      const [locationsResult, clientsResult, tasksResult, defectsResult] =
        await Promise.all([
          supabase
            .from("locations")
            .select("*")
            .order("name", { ascending: true }),
          supabase.from("clients").select("*"),
          supabase.from("service_tasks").select("*").eq("status", "planned"),
          supabase
            .from("service_tasks")
            .select("*")
            .eq("task_type", "defect")
            .eq("status", "open"),
        ]);

      const defectsMissingTaskType =
        defectsResult.error?.message?.includes("task_type") &&
        defectsResult.error?.message?.includes("does not exist");

      if (
        locationsResult.error ||
        clientsResult.error ||
        tasksResult.error ||
        (defectsResult.error && !defectsMissingTaskType)
      ) {
        setErrorMessage(
          locationsResult.error?.message ||
            clientsResult.error?.message ||
            tasksResult.error?.message ||
            defectsResult.error?.message ||
            "Грешка при зареждане"
        );
        setLoadState("error");
        return;
      }

      const locationRows = (locationsResult.data as DataRecord[]) ?? [];
      const clientRows = (clientsResult.data as DataRecord[]) ?? [];
      const taskRows = (tasksResult.data as DataRecord[]) ?? [];
      const defectRows = defectsMissingTaskType
        ? []
        : (defectsResult.data as DataRecord[]) ?? [];

      function matchingTasks(locationKeys: string[]) {
        const keys = new Set(locationKeys.filter(Boolean));
        return taskRows.filter((task) => taskMatchesLocation(task, keys));
      }

      function countOpenDefects(locationKeys: string[]) {
        const keys = new Set(locationKeys.filter(Boolean));
        return defectRows.filter((defect) => taskMatchesLocation(defect, keys))
          .length;
      }

      setLocations(
        locationRows.map((location, index) => {
          const clientId = textValue(location, ["client_id"]);
          const client = clientRows.find(
            (row) => textValue(row, ["id"]) === clientId
          );
          const locationId = textValue(location, ["id"]);
          const qrCode = textValue(location, ["qr_code", "code"]) || locationId;
          const locationName = textValue(location, ["name", "object_name", "title"]);
          const locationTasks = matchingTasks([locationId, qrCode, locationName]);
          const taskDates = locationTasks
            .map((task) => textValue(task, ["due_date"]))
            .filter(Boolean)
            .sort();
          const nextVisitDate = taskDates[0] ?? "";
          const openDefects = countOpenDefects([locationId, qrCode, locationName]);
          const hasOverdueAction = taskDates.some((date) => {
            const days = daysUntil(date);
            return days !== null && days < 0;
          });
          const nextVisitDays = daysUntil(nextVisitDate);
          const isExpiringSoon =
            nextVisitDays !== null && nextVisitDays >= 0 && nextVisitDays <= 30;
          const isInactive = isInactiveLocation(location);
          const status: LocationStatus =
            isInactive
              ? "Неактивен"
              : openDefects > 0
              ? "Проблем"
              : hasOverdueAction
                ? "Просрочен"
                : "Изряден";

          return {
            id: locationId || String(index + 1),
            qrCode,
            name:
              textValue(location, ["name", "object_name", "title"]) ||
              "Без име",
            objectType: textValue(location, ["object_type", "objectType", "type"]),
            address: textValue(location, ["address", "full_address"]),
            status,
            client: textValue(client, ["name", "organization", "company_name"]),
            tasks: locationTasks.length,
            openDefects,
            nextVisitDate,
            hasOverdueAction,
            isExpiringSoon,
          };
        })
      );
      setLoadState("ready");
    } catch {
      setErrorMessage("Грешка при връзка със Supabase");
      setLoadState("error");
    }
  }

  useEffect(() => {
    loadLocations();

    window.addEventListener(serviceTasksUpdatedEvent, loadLocations);
    window.addEventListener("storage", loadLocations);

    return () => {
      window.removeEventListener(serviceTasksUpdatedEvent, loadLocations);
      window.removeEventListener("storage", loadLocations);
    };
  }, []);

  async function handleDeleteLocation(location: LocationListItem) {
    const confirmed = window.confirm(
      `Сигурни ли сте, че искате да изтриете обекта "${location.name}"?`
    );

    if (!confirmed) return;

    setDeletingLocationId(location.id);
    setErrorMessage("");

    try {
      const supabase = createSupabaseBrowserClient();

      await supabase.from("location_services").delete().eq("location_id", location.id);
      await supabase
        .from("equipment")
        .update({
          archived: true,
          archived_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("location_id", location.id);

      const { error } = await supabase
        .from("locations")
        .delete()
        .eq("id", location.id);

      if (error) {
        setErrorMessage(error.message || "Обектът не беше изтрит");
        setLoadState("error");
        return;
      }

      setLocations((current) =>
        current.filter((item) => item.id !== location.id)
      );
    } catch {
      setErrorMessage("Грешка при връзка със Supabase");
      setLoadState("error");
    } finally {
      setDeletingLocationId("");
    }
  }

  const filterButtons: Array<{
    value: ObjectViewFilter;
    label: string;
    count: number;
  }> = [
    { value: "all", label: "Всички", count: metrics.total },
    { value: "active", label: "Изрядни", count: metrics.active },
    { value: "expiring", label: "Изтича скоро", count: metrics.expiring },
    { value: "overdue", label: "Просрочени", count: metrics.overdue },
    { value: "defects", label: "Проблеми", count: metrics.defects },
  ];

  return (
    <AppShell
      title="Обекти"
      description="Профили на обекти, проверки, протоколи и сервизни дейности"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={loadLocations}>
            <RefreshCw size={17} />
            Обнови
          </Button>
          <Link
            href="/locations/new"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-orange-400 px-5 text-sm font-black text-white shadow-sm transition hover:shadow-md"
          >
            <Plus size={18} />
            Нов обект
          </Link>
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5">
          <StatTile
            icon={Building2}
            label="Всички обекти"
            value={metrics.total}
            note={`${filteredLocations.length} показани`}
            tone="slate"
          />
          <StatTile
            icon={CheckCircle2}
            label="Изрядни"
            value={metrics.active}
            note="Без дефекти и просрочия"
            tone="green"
          />
          <StatTile
            icon={Clock3}
            label="Изтича скоро"
            value={metrics.expiring}
            note="Посещение до 30 дни"
            tone="orange"
          />
          <StatTile
            icon={AlertTriangle}
            label="Просрочени"
            value={metrics.overdue}
            note="Имат минала дата"
            tone="red"
          />
          <StatTile
            icon={Filter}
            label="Проблеми"
            value={metrics.defects}
            note="Отворени дефекти"
            tone="red"
          />
        </div>
      </Card>

      <Card className="mt-5 p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-3 lg:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                size={18}
              />
              <Input
                placeholder="Търсене по име, клиент, адрес, ID..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full pl-11"
              />
            </div>
            <select
              value={objectTypeFilter}
              onChange={(event) => setObjectTypeFilter(event.target.value)}
              className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 shadow-sm transition focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100 lg:w-60"
            >
              <option value="">Всички типове</option>
              {objectTypeFilters.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            {filterButtons.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setViewFilter(filter.value)}
                className={`h-10 rounded-xl border px-3 text-sm font-black transition ${
                  viewFilter === filter.value
                    ? "border-orange-300 bg-orange-50 text-orange-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-orange-200 hover:bg-orange-50"
                }`}
              >
                {filter.label} · {filter.count}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {loadState === "error" ? (
        <div className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">
          {errorMessage || "Грешка при зареждане"}
        </div>
      ) : null}

      <Card className="mt-6 overflow-hidden">
        <div className="hidden grid-cols-[minmax(220px,1.4fr)_minmax(160px,1fr)_minmax(220px,1.2fr)_minmax(150px,0.8fr)_minmax(150px,0.8fr)_minmax(150px,0.8fr)_110px] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-black uppercase text-slate-400 xl:grid">
          <div>Име на обекта</div>
          <div>Клиент</div>
          <div>Адрес</div>
          <div>Тип обект</div>
          <div>Следващо посещение</div>
          <div>Статус</div>
          <div className="text-right">Действия</div>
        </div>

        {loadState === "loading" ? (
          <div className="p-8 text-center text-sm font-bold text-slate-500">
            Зареждане...
          </div>
        ) : null}

        {loadState !== "loading" && filteredLocations.length === 0 ? (
          <div className="p-8 text-center text-sm font-bold text-slate-500">
            Няма намерени обекти.
          </div>
        ) : null}

        {filteredLocations.map((location) => {
          const nextVisitDays = daysUntil(location.nextVisitDate);
          const nextVisitTone =
            nextVisitDays === null
              ? "text-slate-400"
              : nextVisitDays < 0
              ? "text-red-600"
              : nextVisitDays <= 30
                ? "text-orange-600"
                : "text-emerald-600";

          return (
            <div
              key={location.id}
              className="grid grid-cols-1 gap-4 border-b border-slate-100 px-5 py-4 last:border-b-0 xl:grid-cols-[minmax(220px,1.4fr)_minmax(160px,1fr)_minmax(220px,1.2fr)_minmax(150px,0.8fr)_minmax(150px,0.8fr)_minmax(150px,0.8fr)_110px] xl:items-center"
            >
              <div className="min-w-0">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                    <Building2 size={20} />
                  </div>
                  <div className="min-w-0">
                    <Link
                      href={`/locations/${location.qrCode}`}
                      className="font-black text-slate-950 transition hover:text-orange-700"
                    >
                      {location.name}
                    </Link>
                    <div className="mt-1 text-xs font-bold text-slate-400">
                      ID: {location.qrCode || location.id}
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-sm font-bold text-slate-700">
                <span className="text-xs font-black uppercase text-slate-400 xl:hidden">
                  Клиент:{" "}
                </span>
                {location.client || "Няма свързан клиент"}
              </div>

              <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-500">
                <MapPin size={16} className="shrink-0 text-slate-400" />
                <span className="truncate">{location.address || "Няма адрес"}</span>
              </div>

              <div>
                {location.objectType ? (
                  <Badge variant="neutral">{location.objectType}</Badge>
                ) : (
                  <span className="text-sm font-bold text-slate-400">Без тип</span>
                )}
              </div>

              <div>
                <div className="text-sm font-black text-slate-900">
                  {formatDateValue(location.nextVisitDate) || "—"}
                </div>
                <div className={`mt-1 text-xs font-black ${nextVisitTone}`}>
                  {nextVisitLabel(location.nextVisitDate)}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant={statusVariant[location.status]}>
                  {location.status}
                </Badge>
              </div>

              <div className="flex justify-start gap-2 xl:justify-end">
                <Link
                  href={`/locations/${location.qrCode}`}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                  aria-label={`Отвори ${location.name}`}
                >
                  <Eye size={17} />
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDeleteLocation(location)}
                  disabled={deletingLocationId === location.id}
                  aria-label={`Изтрий ${location.name}`}
                >
                  <Trash2 size={17} />
                </Button>
              </div>
            </div>
          );
        })}
      </Card>

      {loadState !== "loading" && filteredLocations.length > 0 ? (
        <div className="mt-3 flex flex-col gap-2 text-xs font-bold text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Показани {filteredLocations.length} от {locations.length} обекта
          </span>
          <Link
            href="/locations/new"
            className="inline-flex items-center gap-1 text-orange-600 transition hover:text-orange-700"
          >
            Добави нов обект
            <ArrowRight size={14} />
          </Link>
        </div>
      ) : null}
    </AppShell>
  );
}
