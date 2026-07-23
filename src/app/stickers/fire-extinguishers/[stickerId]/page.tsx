"use client";

import { use, useEffect, useMemo, useState, type ReactElement } from "react";
import {
  Building2,
  CalendarDays,
  Flame,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  UserRound,
  Printer,
  Globe2,
} from "lucide-react";
import { createSupabaseBrowserClient } from "../../../../lib/supabase/client";
import {
  companySettingsStorageKey,
  defaultCompanySettings,
  type CompanySettings,
} from "../../../../lib/settings";

type StickerRecord = {
  sticker_number: number;
  object_name: string;
  object_location: string;
  technician: string;
  service_type?: string;
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

type StickerPageProps = {
  params: Promise<{ stickerId: string }>;
};

const defaultSticker: StickerRecord = {
  sticker_number: 40000,
  object_name: "Kaufland \u0441\u0435\u0432\u0435\u0440",
  object_location: "\u0412\u0445\u043e\u0434 - \u043a\u043b\u0438\u0435\u043d\u0442\u0441\u043a\u0430 \u0437\u043e\u043d\u0430",
  technician: "\u041c\u0435\u0445\u043c\u0435\u0434 \u041c\u0435\u0445\u043c\u0435\u0434",
  service_type: "\u0442\u0435\u0445\u043d\u0438\u0447\u0435\u0441\u043a\u043e \u043e\u0431\u0441\u043b\u0443\u0436\u0432\u0430\u043d\u0435",
  service_date: "2026-05-22",
  next_service_date: "2027-05-22",
  extinguisher_type: "ABC \u043f\u0440\u0430\u0445\u043e\u0432 6 kg",
  category: "ABC",
  extinguishing_agent: "\u043f\u0440\u0430\u0445",
  capacity_mass: "6",
  brand: "",
  model: "",
  serial_number: "",
  equipment_id: null,
  company_settings: {
    companyName: "FIREControl",
    address: "\u0433\u0440. \u0428\u0443\u043c\u0435\u043d, \u0443\u043b. \u201e\u0412\u043b\u0430\u0434\u0430\u0439\u0441\u043a\u043e \u0432\u044a\u0441\u0442\u0430\u043d\u0438\u0435\u201c 152",
    phone: "+358 896 089 991",
    email: "office@firecontrol.bg",
    bulstat: "\u2116 873000-1637\n29.12.2023",
  },
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

function normalizeExtinguisherType(value: string) {
  return value
    .replace(/прахов\s+прах/gi, "Прахов")
    .replace(/прах\s+прахов/gi, "Прахов")
    .replace(/въглероден\s+диоксид\s+(co2|со2|co₂)/gi, "CO2")
    .replace(/(co2|со2|co₂)\s+въглероден\s+диоксид/gi, "CO2")
    .replace(/пенен\s+пяна/gi, "Пенен")
    .replace(/пяна\s+пенен/gi, "Пенен")
    .replace(/воден\s+вода/gi, "Воден")
    .replace(/вода\s+воден/gi, "Воден")
    .replace(/(co2|со2|co₂)\s+(co2|со2|co₂)/gi, "CO2")
    .replace(/\s+/g, " ")
    .trim();
}

function isInvalidServiceSticker(record: StickerRecord) {
  return Boolean(
    record.service_type?.trim() &&
      !record.service_type
        .trim()
        .toLocaleLowerCase("bg-BG")
        .includes("\u0442\u0435\u0445\u043d\u0438\u0447\u0435\u0441\u043a\u043e \u043e\u0431\u0441\u043b\u0443\u0436\u0432\u0430\u043d\u0435")
  );
}

export default function FireExtinguisherStickerPage({ params }: StickerPageProps) {
  const { stickerId } = use(params);
  const [record, setRecord] = useState<StickerRecord | null>(null);
  const [companyFallback, setCompanyFallback] = useState(defaultCompanySettings);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    let isMounted = true;

    async function loadSticker() {
      setCompanyFallback(readLocalCompanySettings());

      try {
        const supabase = createSupabaseBrowserClient();
        const stickerNumber = Number(stickerId);
        const { data, error } = await supabase
          .from("protocol_fire_extinguisher_rows")
          .select("*")
          .eq("sticker_number", stickerNumber)
          .maybeSingle();

        if (!isMounted) return;

        if (error || !data || isInvalidServiceSticker(data as StickerRecord)) {
          setRecord(null);
          setStatus("missing");
          return;
        }

        const nextRecord = data as StickerRecord;
        setRecord(nextRecord);
        setStatus("ready");

        if (nextRecord.equipment_id) {
          await supabase
            .from("equipment")
            .update({ sticker_printed_at: new Date().toISOString() })
            .eq("id", nextRecord.equipment_id);
        }
      } catch {
        if (isMounted) {
          setRecord(null);
          setStatus("missing");
        }
      }
    }

    loadSticker();

    return () => {
      isMounted = false;
    };
  }, [stickerId]);

  const sticker = record ?? { ...defaultSticker, sticker_number: Number(stickerId) || 40000 };
  const company = useMemo(
    () => ({
      ...defaultCompanySettings,
      ...companyFallback,
      ...(sticker.company_settings ?? {}),
    }),
    [companyFallback, sticker.company_settings]
  );
  const licenseLines = (company.bulstat || "\u2116 873000-1637\n29.12.2023")
    .split(/\n|,/) 
    .map((line) => line.trim())
    .filter(Boolean);
  const addressParts = (company.address || defaultSticker.company_settings?.address || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const extinguisherType = normalizeExtinguisherType(
    sticker.extinguisher_type ||
      [
        sticker.category,
        sticker.extinguishing_agent,
        sticker.capacity_mass ? `${sticker.capacity_mass} kg` : "",
      ]
        .filter(Boolean)
        .join(" ")
  );

  return (
    <main className="fire-sticker-page min-h-screen bg-slate-100 px-4 py-6 text-slate-950 print:bg-white print:p-0">
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
          transform: none;
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

        @media print {
          @page {
            size: 90mm 60mm;
            margin: 0;
          }

          html,
          body,
          .fire-sticker-page {
            background: #ffffff !important;
            height: 60mm !important;
            margin: 0 !important;
            min-height: 60mm !important;
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
            transform: none !important;
            width: 90mm !important;
          }

          .fire-sticker-label,
          .fire-sticker-label * {
            max-width: 100%;
          }
        }
      `}</style>
      <div className="mx-auto mb-4 flex max-w-[900px] items-center justify-between print:hidden">
        <div className="text-sm font-bold text-slate-600">
          {status === "loading" ? "Loading sticker..." : status === "missing" ? "Sticker data not found" : "Ready to print"}
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-black text-white shadow-sm hover:bg-red-700"
        >
          <Printer size={16} />
          Print
        </button>
      </div>

      <section className="fire-sticker-label mx-auto grid h-[60mm] w-[90mm] grid-rows-[9.5mm_1fr_8.8mm] overflow-hidden rounded-[5mm] border-[0.9mm] border-red-700 bg-white p-[1.7mm] shadow-2xl">
        <header className="grid grid-cols-[31mm_1fr] items-center gap-[1.7mm] border-b border-slate-300 pb-[1mm]">
          <img src="/firecontrol-header-logo.png" alt="FIREControl" className="h-[7mm] w-full object-contain object-left" />
          <div className="text-center leading-none">
            <div className="rounded-[1mm] bg-red-700 px-[1mm] py-[0.85mm] text-[2.55mm] font-black text-white">
                {"\u0422\u0415\u0425\u041d\u0418\u0427\u0415\u0421\u041a\u041e \u041e\u0411\u0421\u041b\u0423\u0416\u0412\u0410\u041d\u0415"}
            </div>
            <div className="mt-[0.8mm] text-[2.35mm] font-semibold text-slate-800">
                {"\u041d\u0410 \u041f\u041e\u0416\u0410\u0420\u041e\u0413\u0410\u0421\u0418\u0422\u0415\u041b"}
            </div>
          </div>
        </header>

        <div className="grid min-h-0 grid-cols-[25mm_1fr]">
          <aside className="min-h-0 border-r border-slate-300 pr-[1.4mm] pt-[1.5mm]">
            <div className="rounded-[1.4mm] bg-red-700 px-[0.8mm] py-[1.6mm] text-center text-white shadow-sm">
              <div className="text-[2.65mm] font-black leading-none">{"\u0421\u0422\u0418\u041a\u0415\u0420 \u2116"}</div>
              <div className="fire-sticker-number mt-[1.15mm] font-black">
                {sticker.sticker_number}
              </div>
            </div>

            <div className="mt-[1.7mm] border-t border-slate-300 pt-[1.4mm]">
              <div className="grid grid-cols-[5mm_1fr] items-center gap-[1mm]">
                <ShieldCheck size={17} className="text-red-700" strokeWidth={2.4} />
                <div className="min-w-0 leading-tight">
                  <div className="text-[2.05mm] font-black">{"\u0420\u0410\u0417\u0420\u0415\u0428\u0415\u041d\u0418\u0415"}</div>
                  <div className="fire-sticker-value text-[2.3mm] font-semibold">{licenseLines[0] || "\u2116 873000-1637"}</div>
                  <div className="text-[2.05mm]">{licenseLines[1] || "29.12.2023"}</div>
                </div>
              </div>
            </div>
          </aside>

          <div className="min-h-0 pl-[1.7mm] pt-[0.7mm]">
            <StickerInfo icon={<CalendarDays size={13} />} label={"\u0414\u0410\u0422\u0410"} value={formatDate(sticker.service_date)} />
            <StickerInfo icon={<CalendarDays size={13} />} iconClass="text-orange-600" label={"\u0421\u041b\u0415\u0414\u0412. \u041e\u0411\u0421\u041b\u0423\u0416\u0412\u0410\u041d\u0415"} value={formatDate(sticker.next_service_date)} valueClass="text-orange-600" highlight />
            <StickerInfo icon={<UserRound size={13} />} label={"\u0418\u0417\u0412\u042a\u0420\u0428\u0418\u041b"} value={sticker.technician} />
            <StickerInfo icon={<Flame size={13} />} iconClass="text-orange-600" label={"\u0422\u0418\u041f"} value={extinguisherType} />
            <StickerInfo
              icon={<MapPin size={13} />}
              label={"\u041e\u0411\u0415\u041a\u0422"}
              value={sticker.object_name}
              detail={sticker.object_location}
            />
          </div>
        </div>

        <footer className="grid min-h-0 grid-cols-[1.3fr_1fr] grid-rows-2 items-center gap-x-[1.4mm] border-t border-slate-300 pt-[0.9mm] text-[1.95mm] leading-tight">
          <FooterItem icon={<Building2 size={13} />} lines={[addressParts[0] || "\u0433\u0440. \u0428\u0443\u043c\u0435\u043d", addressParts.slice(1).join(", ") || "\u0443\u043b. \u201e\u0412\u043b\u0430\u0434\u0430\u0439\u0441\u043a\u043e \u0432\u044a\u0441\u0442\u0430\u043d\u0438\u0435\u201c 152"]} />
          <FooterItem icon={<Phone size={13} />} lines={[company.phone || "+358 896 089 991"]} />
          <FooterItem icon={<Globe2 size={13} />} lines={["www.firecontrol.bg"]} />
          <FooterItem icon={<Mail size={13} />} lines={[company.email || "office@firecontrol.bg"]} />
        </footer>
      </section>
    </main>
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
          <div key={line}>
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}
