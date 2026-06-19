"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Fan,
  FileText,
  FireExtinguisher,
  LampWallUp,
  MapPin,
  Phone,
  ShieldCheck,
  Siren,
  SprayCan,
  Waves,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { createSupabaseBrowserClient } from "../../../lib/supabase/client";

type DataRecord = Record<string, unknown>;

type PassportLocation = {
  id: string;
  databaseId: string;
  name: string;
  address: string;
  region: string;
  status: string;
  client: string;
  contact: string;
  phone: string;
  email: string;
  lastCheck: string;
  nextCheck: string;
};

type PassportEquipment = {
  id: string;
  name: string;
  type: string;
  location: string;
  status: string;
  nextCheckDate: string;
  notes: string;
  subtype: string;
  capacity: string;
  description: string;
  totalDevices: string;
};

type PassportProtocol = {
  id: string;
  number: string;
  type: string;
  date: string;
  status: string;
  technician: string;
};

type PassportData = {
  location: PassportLocation;
  equipment: PassportEquipment[];
  protocols: PassportProtocol[];
};

const PROTOCOL_TYPE_LABEL: Record<string, string> = {
  subscription: "Абонаментно обслужване",
  extinguisher: "Пожарогасители",
  service: "Протокол за поддръжка на ПИС",
};

function textValue(record: DataRecord | null | undefined, keys: string[]) {
  if (!record) return "";

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }

  return "";
}

function formatDateValue(value: string) {
  if (!value) return "";
  if (!value.includes("-")) return value;

  const [year, month, day] = value.slice(0, 10).split("-");
  return day && month && year ? `${day}.${month}.${year}` : value;
}

function displayDate(value: string) {
  return formatDateValue(value) || "Не е зададена";
}

function mapLocation(
  location: DataRecord,
  client: DataRecord | null,
  qrCode: string
): PassportLocation {
  return {
    id: qrCode,
    databaseId: textValue(location, ["id"]),
    name: textValue(location, ["name", "object_name", "title"]) || qrCode,
    address: textValue(location, ["address", "full_address"]),
    region: textValue(location, ["region", "area"]),
    status: textValue(location, ["status"]) || "изряден",
    client: textValue(client, ["name", "organization", "company_name"]),
    contact: textValue(client, ["contact_person", "contact", "representative"]),
    phone:
      textValue(client, ["phone", "telephone", "mobile"]) ||
      textValue(location, ["phone", "telephone"]),
    email: textValue(client, ["email"]) || "support@firecontrol.bg",
    lastCheck: textValue(location, [
      "last_check",
      "last_check_at",
      "last_service_date",
    ]),
    nextCheck: textValue(location, [
      "next_check",
      "next_check_at",
      "next_service_date",
    ]),
  };
}

function mapEquipment(rows: DataRecord[]): PassportEquipment[] {
  return rows.map((row, index) => ({
    id: textValue(row, ["id"]) || `equipment-${index}`,
    name: textValue(row, ["name"]) || textValue(row, ["type", "equipment_type"]),
    type: textValue(row, ["type", "equipment_type", "category"]),
    location: textValue(row, ["location", "object_location", "place"]),
    status: textValue(row, ["status"]) || "Изряден",
    nextCheckDate: textValue(row, [
      "next_check_date",
      "next_check",
      "next_check_at",
      "next_service_date",
    ]),
    notes: textValue(row, ["notes", "note", "description"]),
    subtype: textValue(row, ["subtype"]),
    capacity: textValue(row, ["capacity", "mass", "charge_mass"]),
    description: textValue(row, ["description"]),
    totalDevices: textValue(row, ["total_devices"]),
  }));
}

function mapProtocols(rows: DataRecord[]): PassportProtocol[] {
  return rows.map((row) => ({
    id: textValue(row, ["id"]),
    number: textValue(row, ["protocol_number", "number"]),
    type: textValue(row, ["protocol_type", "type"]),
    date: textValue(row, ["protocol_date", "date"]),
    status: textValue(row, ["status"]),
    technician: textValue(row, ["technician"]),
  }));
}

function equipmentGroupLabel(type: string) {
  const normalized = type.trim();
  const lower = normalized.toLowerCase();

  if (
    lower.includes("аварийно осветление") ||
    lower.includes("emergency-lighting")
  ) {
    return "Аварийно осветление";
  }

  return normalized || "Друго оборудване";
}

function equipmentGroupTitle(type: string, count: number) {
  return `${equipmentGroupLabel(type)} (${count})`;
}

type EquipmentOverviewItem = {
  label: string;
  value: string;
  icon: LucideIcon;
  iconClassName: string;
};

function numericValue(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function equipmentTypeText(item: PassportEquipment) {
  return [item.type, item.name].join(" ").toLowerCase();
}

function getEquipmentOverview(equipment: PassportEquipment[]): EquipmentOverviewItem[] {
  const matches = (item: PassportEquipment, ...terms: string[]) => {
    const text = equipmentTypeText(item);
    return terms.some((term) => text.includes(term));
  };
  const count = (...terms: string[]) =>
    equipment.filter((item) => matches(item, ...terms)).length;
  const activeExtinguisherCount = equipment.filter(
    (item) =>
      matches(item, "пожарогасител", "extinguisher") &&
      !["бракуван", "липсващ", "неактив"].some((status) =>
        item.status.toLowerCase().includes(status)
      )
  ).length;
  const sum = (field: keyof PassportEquipment, ...terms: string[]) =>
    equipment
      .filter((item) => matches(item, ...terms))
      .reduce((total, item) => total + numericValue(String(item[field] ?? "")), 0);

  const fireAlarmPoints = sum(
    "totalDevices",
    "пожароизвестителна централа",
    "fire-alarm-panel"
  );
  const sprinklerCount = sum("totalDevices", "спринклерна система", "sprinkler");
  const smokeControlCount = equipment
    .filter((item) => matches(item, "димоотвеждане", "smoke-control"))
    .reduce(
      (total, item) =>
        total +
        numericValue(item.subtype) +
        numericValue(item.description) +
        numericValue(item.capacity),
      0
    );

  return [
    {
      label: "Пожарогасители",
      value: String(activeExtinguisherCount),
      icon: FireExtinguisher,
      iconClassName: "text-orange-600",
    },
    {
      label: "Пожароизвестяване",
      value: `${fireAlarmPoints} точки`,
      icon: Siren,
      iconClassName: "text-red-600",
    },
    {
      label: "Пожарни кранове",
      value: String(count("пожарен кран", "fire-hydrant")),
      icon: Waves,
      iconClassName: "text-cyan-600",
    },
    {
      label: "Аварийно осветление",
      value: String(count("аварийно осветление", "emergency-lighting")),
      icon: LampWallUp,
      iconClassName: "text-amber-600",
    },
    {
      label: "Спринклери",
      value: String(sprinklerCount),
      icon: SprayCan,
      iconClassName: "text-blue-600",
    },
    {
      label: "Димоотвеждане",
      value: String(smokeControlCount),
      icon: Fan,
      iconClassName: "text-slate-600",
    },
    {
      label: "Евакуационни планове",
      value: String(count("евакуационен план", "evacuation-plan")),
      icon: ClipboardList,
      iconClassName: "text-emerald-600",
    },
  ].filter((item) => Number.parseInt(item.value, 10) > 0);
}

function equipmentOverviewGridClass(count: number) {
  if (count === 1) return "grid-cols-1";
  if (count === 2) return "grid-cols-2";
  if (count === 3) return "grid-cols-1 sm:grid-cols-3";
  if (count === 4) return "grid-cols-2 lg:grid-cols-4";
  if (count === 5) return "grid-cols-2 md:grid-cols-3 lg:grid-cols-5";
  if (count === 6) return "grid-cols-2 md:grid-cols-3 lg:grid-cols-6";
  return "grid-cols-2 md:grid-cols-4 xl:grid-cols-7";
}

function BrandHeader({ internal = false }: { internal?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-2xl font-black tracking-tight text-slate-900">
          FIRE<span className="text-orange-500">Control</span>
        </div>
        <div className="mt-1 text-xs font-black uppercase text-slate-400">
          {internal ? "Вътрешен паспорт на обект" : "Сервизна поддръжка"}
        </div>
      </div>
      <Badge variant={internal ? "orange" : "success"}>
        {internal ? "ERP" : "Public"}
      </Badge>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  tone?: "neutral" | "warning" | "success";
}) {
  const toneClass =
    tone === "warning"
      ? "bg-orange-50 text-orange-800 ring-orange-100"
      : tone === "success"
        ? "bg-emerald-50 text-emerald-800 ring-emerald-100"
        : "bg-slate-50 text-slate-900 ring-slate-100";

  return (
    <div className={`rounded-2xl p-4 ring-1 ${toneClass}`}>
      <div className="text-xs font-black uppercase opacity-70">{label}</div>
      <div className="mt-2 text-xl font-black">{value}</div>
    </div>
  );
}

function PublicPassport({ data }: { data: PassportData }) {
  const { location } = data;

  return (
    <main className="min-h-screen bg-[#f7f8fb] px-4 py-5 text-slate-900 sm:px-6">
      <div className="mx-auto w-full max-w-xl space-y-4">
        <Card className="p-6">
          <BrandHeader />
          <div className="mt-8">
            <Badge variant="success">
              <ShieldCheck size={14} />
              Активна поддръжка
            </Badge>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-900">
              Обектът се обслужва от FireControl
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              Това е публичен QR изглед. Вътрешната сервизна информация се
              вижда само при сканиране през ERP системата.
            </p>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-lg font-black">Контакт при нужда</h2>
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4">
              <Phone className="text-orange-500" size={18} />
              <span className="font-bold text-slate-800">
                {location.phone || "089466346"}
              </span>
            </div>
            <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4">
              <ShieldCheck className="text-orange-500" size={18} />
              <span className="font-bold text-slate-800">
                support@firecontrol.bg
              </span>
            </div>
          </div>
          <Button className="mt-5 w-full">
            <Phone size={18} />
            Свържете се
          </Button>
        </Card>
      </div>
    </main>
  );
}

function InternalPassport({ data }: { data: PassportData }) {
  const { location, equipment, protocols } = data;
  const attentionEquipment = equipment.filter((item) =>
    ["за обслужване", "просрочен", "бракуван", "липсващ"].some((status) =>
      item.status.toLowerCase().includes(status)
    )
  );
  const recentProtocols = protocols.slice(0, 5);
  const equipmentOverview = useMemo(
    () => getEquipmentOverview(equipment),
    [equipment]
  );
  const groupedEquipment = useMemo(() => {
    const groups = new Map<string, PassportEquipment[]>();

    for (const item of equipment) {
      const key = equipmentGroupLabel(item.type);
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }

    return Array.from(groups.entries());
  }, [equipment]);

  return (
    <main className="min-h-screen bg-[#f7f8fb] px-4 py-5 text-slate-900 sm:px-6">
      <div className="mx-auto w-full max-w-4xl space-y-4">
        <Card className="p-5">
          <BrandHeader internal />
          <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-tight">
                {location.name}
              </h1>
              <div className="mt-3 flex items-start gap-2 text-sm font-bold text-slate-500">
                <MapPin size={17} />
                <span>{location.address || "Адресът не е зададен"}</span>
              </div>
            </div>
            <Badge variant="success">
              <CheckCircle2 size={14} />
              {location.status}
            </Badge>
          </div>
        </Card>

        {equipmentOverview.length > 0 ? (
        <section
          aria-label="Обзор на оборудването"
          className="overflow-hidden rounded-lg border border-slate-200 bg-white"
        >
          <div className={`grid divide-x divide-y divide-slate-100 ${equipmentOverviewGridClass(equipmentOverview.length)}`}>
            {equipmentOverview.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="flex min-h-24 items-center gap-3 px-4 py-3">
                  <Icon size={21} className={`shrink-0 ${item.iconClassName}`} />
                  <div className="min-w-0">
                    <div className="text-lg font-black text-slate-900">{item.value}</div>
                    <div className="mt-0.5 text-[10px] font-black uppercase leading-4 text-slate-400">
                      {item.label}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        ) : null}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <StatCard label="Оборудване" value={equipment.length} />
          <StatCard
            label="За внимание"
            value={attentionEquipment.length}
            tone={attentionEquipment.length ? "warning" : "success"}
          />
          <StatCard label="Последна проверка" value={displayDate(location.lastCheck)} />
          <StatCard label="Следваща проверка" value={displayDate(location.nextCheck)} />
        </div>

        <Card className="p-5">
          <h2 className="flex items-center gap-2 text-lg font-black">
            <AlertTriangle className="text-orange-500" size={19} />
            Бърза ориентация за техника
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs font-black uppercase text-slate-400">
                Клиент / контакт
              </div>
              <div className="mt-2 font-black text-slate-900">
                {location.client || "Не е зададен"}
              </div>
              <div className="mt-1 text-sm font-bold text-slate-600">
                {location.contact || "Контакт не е зададен"} ·{" "}
                {location.phone || "телефон не е зададен"}
              </div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs font-black uppercase text-slate-400">
                Регион / ID
              </div>
              <div className="mt-2 font-black text-slate-900">
                {location.region || "Няма регион"}
              </div>
              <div className="mt-1 font-mono text-sm font-black text-slate-600">
                {location.id}
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="flex items-center gap-2 text-lg font-black">
            <Wrench className="text-orange-500" size={19} />
            Оборудване по зони
          </h2>
          <div className="mt-4 space-y-3">
            {groupedEquipment.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-500">
                Няма въведено оборудване за този обект.
              </div>
            ) : (
              groupedEquipment.map(([type, items]) => (
                <div key={type} className="rounded-2xl bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-black text-slate-900">
                      {equipmentGroupTitle(type, items.length)}
                    </div>
                    <Badge variant="neutral">{items.length}</Badge>
                  </div>
                  <div className="mt-3 space-y-2">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-xl border border-slate-100 bg-white p-3"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="font-black text-slate-800">
                              {item.name || item.type}
                            </div>
                            <div className="mt-1 text-sm font-bold text-slate-500">
                              {item.location || "локация не е зададена"}
                            </div>
                          </div>
                          <Badge
                            variant={
                              item.status.toLowerCase().includes("изряд")
                                ? "success"
                                : "warning"
                            }
                          >
                            {item.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="flex items-center gap-2 text-lg font-black">
            <ClipboardList className="text-orange-500" size={19} />
            Последни дейности
          </h2>
          <div className="mt-4 space-y-3">
            {recentProtocols.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-500">
                Няма записани протоколи за този обект.
              </div>
            ) : (
              recentProtocols.map((protocol) => (
                <Link
                  key={protocol.id}
                  href={`/protocols/view/${encodeURIComponent(protocol.number)}`}
                  className="block rounded-2xl border border-slate-100 bg-slate-50 p-4 transition hover:border-orange-200 hover:bg-orange-50"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2 font-black text-slate-900">
                        <FileText size={17} />
                        {protocol.number || "Протокол"}
                      </div>
                      <div className="mt-1 text-sm font-bold text-slate-500">
                        {PROTOCOL_TYPE_LABEL[protocol.type] ?? protocol.type} ·{" "}
                        {formatDateValue(protocol.date)}
                      </div>
                    </div>
                    <Badge variant={protocol.status === "completed" ? "success" : "neutral"}>
                      {protocol.status === "completed" ? "Завършен" : "Чернова"}
                    </Badge>
                  </div>
                </Link>
              ))
            )}
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Link
            href={`/protocols/new?object=${encodeURIComponent(location.id)}`}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-orange-400 px-5 text-sm font-black text-white shadow-sm transition hover:shadow-md"
          >
            <FileText size={18} />
            Нов протокол
          </Link>
          <Link
            href={`/locations/${encodeURIComponent(location.id)}`}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 shadow-sm transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
          >
            <CalendarDays size={18} />
            Пълен профил
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function QrPassportPage() {
  const params = useParams<{ code?: string | string[] }>();
  const searchParams = useSearchParams();
  const routeCode = Array.isArray(params.code) ? params.code[0] : params.code;
  const internalMode = searchParams.get("mode") === "erp";
  const [data, setData] = useState<PassportData | null>(null);
  const [loadState, setLoadState] = useState<
    "loading" | "ready" | "not-found" | "error"
  >("loading");

  useEffect(() => {
    let isMounted = true;

    async function loadPassport() {
      if (!routeCode) {
        setLoadState("not-found");
        return;
      }

      setLoadState("loading");

      try {
        const supabase = createSupabaseBrowserClient();
        const { data: locationRow, error: locationError } = await supabase
          .from("locations")
          .select("*")
          .eq("qr_code", routeCode)
          .maybeSingle();

        if (!isMounted) return;

        if (locationError) {
          setLoadState("error");
          return;
        }

        if (!locationRow) {
          setLoadState("not-found");
          return;
        }

        const locationRecord = locationRow as DataRecord;
        const clientId = textValue(locationRecord, ["client_id"]);
        const locationId = textValue(locationRecord, ["id"]);
        let clientRecord: DataRecord | null = null;

        if (clientId) {
          const { data: clientRow, error: clientError } = await supabase
            .from("clients")
            .select("*")
            .eq("id", clientId)
            .maybeSingle();

          if (!isMounted) return;

          if (clientError) {
            setLoadState("error");
            return;
          }

          clientRecord = (clientRow as DataRecord | null) ?? null;
        }

        const [equipmentResult, protocolsByLocation, protocolsByQr] =
          await Promise.all([
            supabase
              .from("equipment")
              .select("*")
              .eq("location_id", locationId)
              .limit(200),
            supabase
              .from("protocols")
              .select(
                "id, protocol_number, number, protocol_type, type, protocol_date, date, status, technician, created_at"
              )
              .eq("location_id", locationId)
              .limit(50),
            supabase
              .from("protocols")
              .select(
                "id, protocol_number, number, protocol_type, type, protocol_date, date, status, technician, created_at"
              )
              .eq("object_code", routeCode)
              .limit(50),
          ]);

        if (!isMounted) return;

        const protocolRows = new Map<string, DataRecord>();

        for (const row of [
          ...((protocolsByLocation.data as DataRecord[]) ?? []),
          ...((protocolsByQr.data as DataRecord[]) ?? []),
        ]) {
          const id = textValue(row, ["id"]) || textValue(row, ["protocol_number", "number"]);
          if (id) protocolRows.set(id, row);
        }

        const sortedProtocolRows = Array.from(protocolRows.values()).sort((a, b) =>
          String(b["protocol_date"] ?? b["date"] ?? b["created_at"] ?? "").localeCompare(
            String(a["protocol_date"] ?? a["date"] ?? a["created_at"] ?? "")
          )
        );

        setData({
          location: mapLocation(locationRecord, clientRecord, routeCode),
          equipment: mapEquipment((equipmentResult.data as DataRecord[]) ?? []),
          protocols: mapProtocols(sortedProtocolRows),
        });
        setLoadState("ready");
      } catch {
        if (isMounted) {
          setLoadState("error");
        }
      }
    }

    loadPassport();

    return () => {
      isMounted = false;
    };
  }, [routeCode]);

  if (loadState === "loading") {
    return (
      <main className="min-h-screen bg-[#f7f8fb] px-4 py-5 text-slate-900 sm:px-6">
        <div className="mx-auto w-full max-w-xl">
          <Card className="p-8 text-center text-sm font-bold text-slate-500">
            Зареждане...
          </Card>
        </div>
      </main>
    );
  }

  if (loadState === "error") {
    return (
      <main className="min-h-screen bg-[#f7f8fb] px-4 py-5 text-slate-900 sm:px-6">
        <div className="mx-auto w-full max-w-xl">
          <Card className="p-8 text-center text-sm font-bold text-red-600">
            Грешка при зареждане на паспорта.
          </Card>
        </div>
      </main>
    );
  }

  if (loadState === "not-found" || !data) {
    return (
      <main className="min-h-screen bg-[#f7f8fb] px-4 py-5 text-slate-900 sm:px-6">
        <div className="mx-auto w-full max-w-xl">
          <Card className="p-8 text-center text-sm font-bold text-slate-500">
            Обектът не е намерен.
          </Card>
        </div>
      </main>
    );
  }

  return internalMode ? <InternalPassport data={data} /> : <PublicPassport data={data} />;
}
