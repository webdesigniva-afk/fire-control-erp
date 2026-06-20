"use client";

import {
  Suspense,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from "react";
import { useSearchParams } from "next/navigation";
import {
  Building2,
  CalendarDays,
  Flame,
  Globe2,
  Mail,
  MapPin,
  Phone,
  Printer,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { createSupabaseBrowserClient } from "../../../../lib/supabase/client";
import {
  companySettingsStorageKey,
  defaultCompanySettings,
  type CompanySettings,
} from "../../../../lib/settings";

const STICKER_PRINT_QUEUE_STORAGE_KEY = "firecontrol:sticker-print-queue";

type StickerRecord = {
  sticker_number: number;
  object_name: string;
  object_location: string;
  technician: string;
  service_date: string | null;
  next_service_date: string | null;
  extinguisher_type: string;
  category: string;
  extinguishing_agent: string;
  capacity_mass: string;
  brand: string;
  model: string;
  serial_number: string;
  equipment_id: string | null;
  company_settings: Partial<CompanySettings> | null;
};

function formatDate(value: string | null) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("bg-BG", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function readLocalCompanySettings() {
  if (typeof window === "undefined") return defaultCompanySettings;

  try {
    const raw = window.localStorage.getItem(companySettingsStorageKey);
    return raw
      ? { ...defaultCompanySettings, ...JSON.parse(raw) }
      : defaultCompanySettings;
  } catch {
    return defaultCompanySettings;
  }
}

function readQueuedStickerNumbers(): string[] {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(STICKER_PRINT_QUEUE_STORAGE_KEY) || "{}"
    );
    return Array.isArray(parsed.stickers)
      ? parsed.stickers.map(String).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function normalizeExtinguisherType(value: string) {
  return value
    .replace(/\s+/g, " ")
    .trim();
}

export default function FireExtinguisherStickerQueuePage() {
  return (
    <Suspense fallback={null}>
      <FireExtinguisherStickerQueueContent />
    </Suspense>
  );
}

function FireExtinguisherStickerQueueContent() {
  const searchParams = useSearchParams();
  const idsFromUrl = (searchParams.get("ids") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const stickerNumbers: string[] = idsFromUrl.length
    ? idsFromUrl
    : readQueuedStickerNumbers();
  const [records, setRecords] = useState<StickerRecord[]>([]);
  const [companyFallback, setCompanyFallback] = useState(defaultCompanySettings);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    let isMounted = true;

    async function loadQueue() {
      setCompanyFallback(readLocalCompanySettings());

      const numericIds = stickerNumbers
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value));

      if (!numericIds.length) {
        setStatus("missing");
        return;
      }

      try {
        const supabase = createSupabaseBrowserClient();
        const { data, error } = await supabase
          .from("protocol_fire_extinguisher_rows")
          .select("*")
          .in("sticker_number", numericIds);

        if (!isMounted) return;

        if (error || !data?.length) {
          setRecords([]);
          setStatus("missing");
          return;
        }

        const rows = data as StickerRecord[];
        const byNumber = new Map(rows.map((row) => [row.sticker_number, row]));
        const orderedRows = numericIds
          .map((number) => byNumber.get(number))
          .filter(Boolean) as StickerRecord[];
        setRecords(orderedRows);
        setStatus("ready");

        const equipmentIds = orderedRows
          .map((row) => row.equipment_id)
          .filter(Boolean) as string[];

        if (equipmentIds.length) {
          await supabase
            .from("equipment")
            .update({ sticker_printed_at: new Date().toISOString() })
            .in("id", equipmentIds);
        }
      } catch {
        if (isMounted) {
          setRecords([]);
          setStatus("missing");
        }
      }
    }

    void loadQueue();

    return () => {
      isMounted = false;
    };
  }, [stickerNumbers.join(",")]);

  return (
    <main className="fire-sticker-queue min-h-screen bg-slate-100 px-4 py-6 text-slate-950 print:bg-white print:p-0">
      <style>{`
        .fire-sticker-label,
        .fire-sticker-label * {
          box-sizing: border-box;
        }

        .fire-sticker-label {
          font-family: Arial, Helvetica, sans-serif;
          height: 60mm;
          max-height: 60mm;
          max-width: 90mm;
          min-height: 60mm;
          min-width: 90mm;
          width: 90mm;
        }

        .fire-sticker-number {
          font-size: 6.55mm;
          letter-spacing: -0.2mm;
          line-height: 0.9;
          white-space: nowrap;
        }

        .fire-sticker-value {
          overflow-wrap: anywhere;
          word-break: normal;
        }

        .fire-sticker-sheet {
          break-after: page;
          page-break-after: always;
        }

        .fire-sticker-sheet:last-child {
          break-after: auto;
          page-break-after: auto;
        }

        @media print {
          @page {
            size: 90mm 60mm;
            margin: 0;
          }

          html,
          body,
          .fire-sticker-queue {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .fire-sticker-sheet {
            height: 60mm !important;
            margin: 0 !important;
            overflow: hidden !important;
            padding: 0 !important;
            width: 90mm !important;
          }

          .fire-sticker-label {
            border-radius: 5mm !important;
            box-shadow: none !important;
            height: 60mm !important;
            margin: 0 !important;
            max-height: 60mm !important;
            max-width: 90mm !important;
            min-height: 60mm !important;
            min-width: 90mm !important;
            width: 90mm !important;
          }
        }
      `}</style>

      <div className="mx-auto mb-4 flex max-w-[900px] items-center justify-between print:hidden">
        <div>
          <div className="text-sm font-black text-slate-900">
            Опашка за печат на стикери
          </div>
          <div className="mt-1 text-xs font-bold text-slate-500">
            {status === "loading"
              ? "Зареждане..."
              : status === "missing"
                ? "Няма намерени стикери за печат"
                : `${records.length} стикера са готови за етикетния принтер`}
          </div>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!records.length}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-black text-white shadow-sm transition hover:bg-red-700 disabled:pointer-events-none disabled:opacity-50"
        >
          <Printer size={16} />
          Принтирай опашката
        </button>
      </div>

      <div className="mx-auto flex max-w-[900px] flex-col items-center gap-6 print:m-0 print:block print:max-w-none print:gap-0">
        {records.map((record) => (
          <div key={record.sticker_number} className="fire-sticker-sheet">
            <StickerLabel record={record} companyFallback={companyFallback} />
          </div>
        ))}
      </div>
    </main>
  );
}

function StickerLabel({
  record,
  companyFallback,
}: {
  record: StickerRecord;
  companyFallback: CompanySettings;
}) {
  const company = useMemo(
    () => ({
      ...defaultCompanySettings,
      ...companyFallback,
      ...(record.company_settings ?? {}),
    }),
    [companyFallback, record.company_settings]
  );
  const licenseLines = (company.bulstat || "№ 873000-1637\n29.12.2023")
    .split(/\n|,/)
    .map((line) => line.trim())
    .filter(Boolean);
  const addressParts = (company.address || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const extinguisherType = normalizeExtinguisherType(
    record.extinguisher_type ||
      [
        record.category,
        record.extinguishing_agent,
        record.capacity_mass ? `${record.capacity_mass} kg` : "",
      ]
        .filter(Boolean)
        .join(" ")
  );

  return (
    <section className="fire-sticker-label mx-auto grid h-[60mm] w-[90mm] grid-rows-[9.5mm_1fr_8.8mm] overflow-hidden rounded-[5mm] border-[0.9mm] border-red-700 bg-white p-[1.7mm] shadow-2xl">
      <header className="grid grid-cols-[31mm_1fr] items-center gap-[1.7mm] border-b border-slate-300 pb-[1mm]">
        <img src="/firecontrol-header-logo.png" alt="FIREControl" className="h-[7mm] w-full object-contain object-left" />
        <div className="text-center leading-none">
          <div className="rounded-[1mm] bg-red-700 px-[1mm] py-[0.85mm] text-[2.55mm] font-black text-white">
            ТЕХНИЧЕСКО ОБСЛУЖВАНЕ
          </div>
          <div className="mt-[0.8mm] text-[2.35mm] font-semibold text-slate-800">
            НА ПОЖАРОГАСИТЕЛ
          </div>
        </div>
      </header>

      <div className="grid min-h-0 grid-cols-[25mm_1fr]">
        <aside className="min-h-0 border-r border-slate-300 pr-[1.4mm] pt-[1.5mm]">
          <div className="rounded-[1.4mm] bg-red-700 px-[0.8mm] py-[1.6mm] text-center text-white shadow-sm">
            <div className="text-[2.65mm] font-black leading-none">СТИКЕР №</div>
            <div className="fire-sticker-number mt-[1.15mm] font-black">
              {record.sticker_number}
            </div>
          </div>

          <div className="mt-[1.7mm] border-t border-slate-300 pt-[1.4mm]">
            <div className="grid grid-cols-[5mm_1fr] items-center gap-[1mm]">
              <ShieldCheck size={17} className="text-red-700" strokeWidth={2.4} />
              <div className="min-w-0 leading-tight">
                <div className="text-[2.05mm] font-black">РАЗРЕШЕНИЕ</div>
                <div className="fire-sticker-value text-[2.3mm] font-semibold">
                  {licenseLines[0] || "№ 873000-1637"}
                </div>
                <div className="text-[2.05mm]">{licenseLines[1] || "29.12.2023"}</div>
              </div>
            </div>
          </div>
        </aside>

        <div className="min-h-0 pl-[1.7mm] pt-[0.7mm]">
          <StickerInfo icon={<CalendarDays size={13} />} label="ДАТА" value={formatDate(record.service_date)} />
          <StickerInfo icon={<CalendarDays size={13} />} iconClass="text-orange-600" label="СЛЕДВ. ОБСЛУЖВАНЕ" value={formatDate(record.next_service_date)} valueClass="text-orange-600" highlight />
          <StickerInfo icon={<UserRound size={13} />} label="ИЗВЪРШИЛ" value={record.technician} />
          <StickerInfo icon={<Flame size={13} />} iconClass="text-orange-600" label="ТИП" value={extinguisherType} />
          <StickerInfo
            icon={<MapPin size={13} />}
            label="ОБЕКТ"
            value={record.object_name}
            detail={record.object_location}
          />
        </div>
      </div>

      <footer className="grid min-h-0 grid-cols-[1.3fr_1fr] grid-rows-2 items-center gap-x-[1.4mm] border-t border-slate-300 pt-[0.9mm] text-[1.95mm] leading-tight">
        <FooterItem icon={<Building2 size={13} />} lines={[addressParts[0] || "гр. Шумен", addressParts.slice(1).join(", ") || "ул. „Владайско въстание“ 152"]} />
        <FooterItem icon={<Phone size={13} />} lines={[company.phone || "+358 896 089 991"]} />
        <FooterItem icon={<Globe2 size={13} />} lines={["www.firecontrol.bg"]} />
        <FooterItem icon={<Mail size={13} />} lines={[company.email || "office@firecontrol.bg"]} />
      </footer>
    </section>
  );
}

function StickerInfo({
  icon,
  iconClass = "text-red-700",
  label,
  value,
  valueClass = "",
  detail,
  highlight = false,
}: {
  icon: ReactElement;
  iconClass?: string;
  label: string;
  value: string;
  valueClass?: string;
  detail?: string;
  highlight?: boolean;
}) {
  return (
    <div className={`grid min-h-[5.45mm] grid-cols-[4.6mm_1fr_18mm] items-center gap-[0.8mm] border-b border-dashed border-slate-300 py-[0.45mm] last:border-b-0 ${highlight ? "rounded-[1mm] bg-orange-50 px-[0.6mm]" : ""}`}>
      <div className={iconClass}>{icon}</div>
      <div className="text-[2.05mm] font-black leading-tight">{label}</div>
      <div className={`fire-sticker-value text-right text-[2.25mm] font-semibold leading-tight ${valueClass}`}>
        <div>{value || "-"}</div>
        {detail ? <div className="text-[1.85mm] font-normal text-slate-700">{detail}</div> : null}
      </div>
    </div>
  );
}

function FooterItem({
  icon,
  lines,
}: {
  icon: ReactElement;
  lines: string[];
}) {
  return (
    <div className="flex min-w-0 items-center gap-[0.7mm]">
      <div className="shrink-0 text-red-700">{icon}</div>
      <div className="min-w-0 break-words font-semibold leading-tight">
        {lines.filter(Boolean).map((line) => (
          <div key={line}>{line}</div>
        ))}
      </div>
    </div>
  );
}
