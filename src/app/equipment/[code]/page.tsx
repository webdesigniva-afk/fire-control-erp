"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Building2,
  CalendarDays,
  FileText,
  FireExtinguisher,
  MapPin,
  QrCode,
} from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { Card } from "../../../components/ui/card";
import { createSupabaseBrowserClient } from "../../../lib/supabase/client";

type DataRecord = Record<string, unknown>;
type StatusTone = "neutral" | "danger" | "warning" | "success";

const TEAM_SESSION_STORAGE_KEY = "firecontrol:team-session";

type EquipmentPassport = {
  id: string;
  qrCode: string;
  name: string;
  type: string;
  category: string;
  extinguishingAgentType: string;
  extinguishingAgentTradeName: string;
  capacity: string;
  brand: string;
  model: string;
  serialNumber: string;
  locationText: string;
  lastCheckDate: string;
  nextCheckDate: string;
  notes: string;
  createdAt: string;
  objectName: string;
  objectAddress: string;
  clientName: string;
};

type ServiceHistory = {
  id: string;
  protocolNumber: string;
  serviceType: string;
  serviceDate: string;
  nextServiceDate: string;
  technician: string;
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

function statusTone(nextCheckDate: string): StatusTone {
  if (!nextCheckDate) return "neutral";
  const date = new Date(`${nextCheckDate.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "neutral";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((date.getTime() - today.getTime()) / 86_400_000);

  if (days < 0) return "danger";
  if (days <= 30) return "warning";
  return "success";
}

function statusLabel(nextCheckDate: string) {
  const tone = statusTone(nextCheckDate);
  if (tone === "danger") return "Просрочен";
  if (tone === "warning") return "Предстоящо обслужване";
  if (tone === "success") return "Изряден";
  return "Без дата";
}

function hasLocalTeamSession() {
  if (typeof window === "undefined") return false;

  try {
    const raw = window.localStorage.getItem(TEAM_SESSION_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as DataRecord;
    return Boolean(
      textValue(parsed, ["id"]) ||
        textValue(parsed, ["email"]) ||
        textValue(parsed, ["name"])
    );
  } catch {
    return false;
  }
}

function mapEquipment(
  equipment: DataRecord,
  location: DataRecord | null,
  client: DataRecord | null
): EquipmentPassport {
  return {
    id: textValue(equipment, ["id"]),
    qrCode: textValue(equipment, ["equipment_qr_code"]),
    name:
      textValue(equipment, ["display_name", "name"]) ||
      textValue(equipment, ["equipment_type", "type"]) ||
      "Оборудване",
    type: textValue(equipment, ["equipment_type", "type"]),
    category: textValue(equipment, ["extinguisher_category", "category", "subtype"]),
    extinguishingAgentType: textValue(equipment, ["extinguishing_agent_type"]),
    extinguishingAgentTradeName: textValue(equipment, [
      "extinguishing_agent_trade_name",
    ]),
    capacity: textValue(equipment, ["capacity"]),
    brand: textValue(equipment, ["brand"]),
    model: textValue(equipment, ["model"]),
    serialNumber: textValue(equipment, ["serial_number", "serial"]),
    locationText: textValue(equipment, ["location", "object_location", "place"]),
    lastCheckDate: textValue(equipment, ["last_check_date", "last_service_date"]),
    nextCheckDate: textValue(equipment, ["next_check_date", "next_service_date"]),
    notes: textValue(equipment, ["notes", "note"]),
    createdAt: textValue(equipment, ["created_at"]),
    objectName: textValue(location, ["name", "object_name", "title"]),
    objectAddress: textValue(location, ["address", "full_address"]),
    clientName: textValue(client, ["name", "company_name", "organization"]),
  };
}

function mapHistory(rows: DataRecord[]): ServiceHistory[] {
  return rows.map((row, index) => ({
    id: textValue(row, ["id"]) || `history-${index}`,
    protocolNumber: textValue(row, ["protocol_number"]),
    serviceType: textValue(row, ["service_type"]),
    serviceDate: textValue(row, ["service_date"]),
    nextServiceDate: textValue(row, ["next_service_date"]),
    technician: textValue(row, ["technician", "technician_id"]),
  }));
}

function DetailTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <div className="text-xs font-black uppercase text-slate-400">{label}</div>
      <div className="mt-1 break-words text-sm font-black text-slate-900">
        {value || "-"}
      </div>
    </div>
  );
}

export default function EquipmentPassportPage() {
  const params = useParams<{ code?: string | string[] }>();
  const routeCode = Array.isArray(params.code) ? params.code[0] : params.code;
  const [equipment, setEquipment] = useState<EquipmentPassport | null>(null);
  const [history, setHistory] = useState<ServiceHistory[]>([]);
  const [loadState, setLoadState] = useState<
    "loading" | "ready" | "not-found" | "unauthorized" | "error"
  >("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadEquipment() {
      if (!routeCode) {
        setLoadState("not-found");
        return;
      }

      setLoadState("loading");
      setErrorMessage("");

      try {
        const supabase = createSupabaseBrowserClient();
        const { data: sessionData } = await supabase.auth.getSession();
        const isAllowed = Boolean(sessionData.session) || hasLocalTeamSession();

        if (!isAllowed) {
          if (!mounted) return;
          setLoadState("unauthorized");
          return;
        }

        const decodedCode = decodeURIComponent(routeCode);
        let { data: equipmentRow, error } = await supabase
          .from("equipment")
          .select("*")
          .eq("equipment_qr_code", decodedCode)
          .maybeSingle();

        if (!equipmentRow && !error) {
          const fallback = await supabase
            .from("equipment")
            .select("*")
            .eq("id", decodedCode)
            .maybeSingle();

          equipmentRow = fallback.data;
          error = fallback.error;
        }

        if (!mounted) return;

        if (error) {
          setErrorMessage(
            error.message.includes("equipment_qr_code")
              ? "Липсва QR колоната за оборудване. Пуснете sql/equipment_qr_stability.sql."
              : error.message
          );
          setLoadState("error");
          return;
        }

        if (!equipmentRow) {
          setLoadState("not-found");
          return;
        }

        const equipmentRecord = equipmentRow as DataRecord;
        const locationId = textValue(equipmentRecord, [
          "location_id",
          "object_id",
          "site_id",
        ]);
        let locationRecord: DataRecord | null = null;
        let clientRecord: DataRecord | null = null;

        if (locationId) {
          const locationResult = await supabase
            .from("locations")
            .select("*")
            .eq("id", locationId)
            .maybeSingle();

          locationRecord = (locationResult.data as DataRecord | null) ?? null;
        }

        const clientId = textValue(locationRecord, ["client_id"]);
        if (clientId) {
          const clientResult = await supabase
            .from("clients")
            .select("*")
            .eq("id", clientId)
            .maybeSingle();

          clientRecord = (clientResult.data as DataRecord | null) ?? null;
        }

        const historyResult = await supabase
          .from("fire_extinguisher_service_history")
          .select("*")
          .eq("equipment_id", textValue(equipmentRecord, ["id"]))
          .order("service_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(50);

        if (!mounted) return;

        setEquipment(mapEquipment(equipmentRecord, locationRecord, clientRecord));
        setHistory(mapHistory((historyResult.data as DataRecord[]) ?? []));
        setLoadState("ready");
      } catch (error) {
        if (!mounted) return;
        setErrorMessage(
          error instanceof Error ? error.message : "Грешка при зареждане."
        );
        setLoadState("error");
      }
    }

    void loadEquipment();

    return () => {
      mounted = false;
    };
  }, [routeCode]);

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-5 text-slate-950">
      <div className="mx-auto w-full max-w-4xl space-y-4">
        <header className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xs font-black uppercase text-orange-600">
              FireControl
            </div>
            <h1 className="mt-1 text-2xl font-black tracking-tight">
              Паспорт на пожарогасител
            </h1>
          </div>
        </header>

        {loadState === "loading" ? (
          <Card className="p-8 text-center text-sm font-bold text-slate-500">
            Зареждане...
          </Card>
        ) : null}

        {loadState === "error" ? (
          <Card className="border-red-200 bg-red-50 p-6 text-sm font-bold text-red-700">
            {errorMessage || "Оборудването не можа да се зареди."}
          </Card>
        ) : null}

        {loadState === "not-found" ? (
          <Card className="p-8 text-center text-sm font-bold text-slate-500">
            Оборудването не е намерено.
          </Card>
        ) : null}

        {loadState === "unauthorized" ? (
          <Card className="p-8 text-center">
            <div className="text-lg font-black text-slate-950">
              Необходим е вход в системата
            </div>
            <p className="mx-auto mt-2 max-w-md text-sm font-bold leading-6 text-slate-500">
              Този QR код е вътрешен за FireControl. Влезте в профила си и го
              сканирайте през системата, за да отворите паспорта.
            </p>
            <Link
              href="/login"
              className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-red-600 px-5 text-sm font-black text-white shadow-sm transition hover:bg-red-700"
            >
              Вход
            </Link>
          </Card>
        ) : null}

        {equipment ? (
          <>
            <Card className="overflow-hidden">
              <div className="grid gap-0 lg:grid-cols-[1fr_280px]">
                <div className="p-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
                      <FireExtinguisher size={24} />
                    </div>
                    <div className="min-w-0">
                      <h2 className="break-words text-2xl font-black tracking-tight text-slate-950">
                        {equipment.name}
                      </h2>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant={statusTone(equipment.nextCheckDate)}>
                          {statusLabel(equipment.nextCheckDate)}
                        </Badge>
                        <Badge variant="neutral">
                          <QrCode size={14} />
                          {equipment.qrCode}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-3 md:grid-cols-2">
                    <DetailTile label="Сериен номер" value={equipment.serialNumber} />
                    <DetailTile
                      label="Вид"
                      value={equipment.category || equipment.type}
                    />
                    <DetailTile label="Вместимост" value={equipment.capacity} />
                    <DetailTile label="Марка" value={equipment.brand} />
                    <DetailTile label="Модел" value={equipment.model} />
                    <DetailTile
                      label="Пожарогасително вещество"
                      value={[
                        equipment.extinguishingAgentType,
                        equipment.extinguishingAgentTradeName,
                      ]
                        .filter(Boolean)
                        .join(" / ")}
                    />
                    <DetailTile
                      label="Последно обслужване"
                      value={formatDateValue(equipment.lastCheckDate)}
                    />
                    <DetailTile
                      label="Следващо обслужване"
                      value={formatDateValue(equipment.nextCheckDate)}
                    />
                  </div>
                </div>

                <aside className="border-t border-slate-100 bg-slate-50 p-5 lg:border-l lg:border-t-0">
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 rounded-xl bg-white p-4">
                      <Building2 className="mt-0.5 text-orange-500" size={18} />
                      <div>
                        <div className="text-xs font-black uppercase text-slate-400">
                          Клиент
                        </div>
                        <div className="mt-1 text-sm font-black text-slate-800">
                          {equipment.clientName || "-"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 rounded-xl bg-white p-4">
                      <MapPin className="mt-0.5 text-orange-500" size={18} />
                      <div>
                        <div className="text-xs font-black uppercase text-slate-400">
                          Обект
                        </div>
                        <div className="mt-1 text-sm font-black text-slate-800">
                          {equipment.objectName || "-"}
                        </div>
                        <div className="mt-1 text-xs font-bold text-slate-500">
                          {equipment.objectAddress || equipment.locationText || "-"}
                        </div>
                      </div>
                    </div>
                  </div>
                </aside>
              </div>
            </Card>

            {equipment.notes ? (
              <Card className="p-5">
                <h2 className="text-lg font-black">Бележки</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm font-bold leading-6 text-slate-600">
                  {equipment.notes}
                </p>
              </Card>
            ) : null}

            <Card className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black">История на обслужване</h2>
                  <p className="mt-1 text-sm font-medium text-slate-500">
                    Протоколи и сервизни действия за този пожарогасител.
                  </p>
                </div>
                <Badge variant="neutral">{history.length}</Badge>
              </div>

              {history.length === 0 ? (
                <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm font-bold text-slate-500">
                  Все още няма записана история.
                </div>
              ) : (
                <div className="mt-5 divide-y divide-slate-100">
                  {history.map((row) => (
                    <div
                      key={row.id}
                      className="grid gap-3 py-4 md:grid-cols-[160px_1fr_150px]"
                    >
                      <div className="flex items-center gap-2 text-sm font-black text-slate-800">
                        <CalendarDays size={16} className="text-orange-500" />
                        {formatDateValue(row.serviceDate) || "Без дата"}
                      </div>
                      <div>
                        <div className="text-sm font-black text-slate-900">
                          {row.serviceType || "Обслужване"}
                        </div>
                        <div className="mt-1 text-xs font-bold text-slate-500">
                          Техник: {row.technician || "-"} · Следващо:{" "}
                          {formatDateValue(row.nextServiceDate) || "-"}
                        </div>
                      </div>
                      <div className="text-sm font-bold text-slate-600">
                        {row.protocolNumber ? (
                          <span className="inline-flex items-center gap-2">
                            <FileText size={15} />
                            {row.protocolNumber}
                          </span>
                        ) : (
                          "-"
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </>
        ) : null}
      </div>
    </main>
  );
}
