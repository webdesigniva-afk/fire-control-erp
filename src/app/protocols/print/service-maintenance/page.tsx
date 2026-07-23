import { PrintButton } from "../../../../components/print-button";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { PrintPhotoAttachments, PrintSignatureLine } from "../signature-preview";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const COMPANY_SETTINGS_KEY = "firecontrol:settings:company";

type CompanyPrintSettings = {
  companyName: string;
  address: string;
  phone: string;
  email: string;
};

const checklistRows = [
  {
    number: "1",
    activity: "сервизно техническо обслужване",
    heading: true,
  },
  {
    number: "1.1",
    activity:
      "Проверка за безпрепятствен достъп до съоръженията за управление и индикация (B)",
  },
  {
    number: "1.2",
    activity:
      "Проверка дали етикетите и индикациите на съоръжението за управление и индикация (B) могат да бъдат лесно разчетени",
  },
  {
    number: "1.3",
    activity:
      "Проверка дали фоновият шум позволява звуковата индикация на съоръжението за управление и индикация да бъде чута",
  },
  {
    number: "1.4",
    activity: "Проверка на архива и паспорта на системата",
  },
  {
    number: "1.5",
    activity:
      "Проверка на функционалността на резервното електрозахранване чрез изключване на предпазителя на основното захранване (L)",
  },
  {
    number: "1.6",
    activity:
      "Замерване на захранващите стойности на основното и резервното електрозахранване (L)",
  },
  {
    number: "1.7",
    activity:
      "Проверка на функциите за следене за аларма, повреда, изключване и тест на съоръженията за управление и индикация (B)",
  },
  {
    number: "1.8",
    activity:
      "Проверка за осигурен свободен достъп до всички ръчни пожарни бутони (D)",
  },
  {
    number: "1.9",
    activity: "Проверка на пожароизвестители",
  },
];

const faultRows = [
  "Дефекти на системата",
  "Отклонения на системата спрямо документираното пускане в действие:",
  "Статус на системата",
  "Следващо посещение",
];

function valueFromQuery(
  query: Record<string, string | string[] | undefined>,
  key: string,
  fallback: string
) {
  const value = query[key];
  if (Array.isArray(value)) {
    return value[0] ?? fallback;
  }

  return value ?? fallback;
}

function valueFromSettingsOrQuery(
  settingsValue: string,
  query: Record<string, string | string[] | undefined>,
  key: string,
  fallback: string
) {
  return settingsValue.trim() || valueFromQuery(query, key, fallback);
}

async function readCompanyPrintSettings(): Promise<CompanyPrintSettings> {
  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", COMPANY_SETTINGS_KEY)
      .maybeSingle();

    if (error) return { companyName: "", address: "", phone: "", email: "" };
    const value = data?.value;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { companyName: "", address: "", phone: "", email: "" };
    }

    const record = value as Partial<CompanyPrintSettings>;
    return {
      companyName: typeof record.companyName === "string" ? record.companyName : "",
      address: typeof record.address === "string" ? record.address : "",
      phone: typeof record.phone === "string" ? record.phone : "",
      email: typeof record.email === "string" ? record.email : "",
    };
  } catch {
    return { companyName: "", address: "", phone: "", email: "" };
  }
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("bg-BG", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatDateValue(value: string, fallback: string) {
  if (!value) return fallback;

  const [year, month, day] = value.split("-");
  if (day && month && year) {
    return `${day}.${month}.${year}`;
  }

  return value;
}

function parseChecks(value: string) {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

function checkValueForRow(checks: Record<string, string>, rowNumber: string) {
  const matchedEntry = Object.entries(checks).find(([key]) =>
    key.startsWith(`${rowNumber} `)
  );

  return matchedEntry?.[1] ?? "";
}

function CheckCell({ checked }: { checked: boolean }) {
  return (
    <td className="border border-black px-0.5 py-0.5 text-center align-middle text-[11px] leading-none">
      <span className="inline-flex h-3.5 w-3.5 items-center justify-center border border-black">
        {checked ? (
          <span className="mb-0.5 h-2 w-1.5 rotate-45 border-b border-r border-black" />
        ) : null}
      </span>
    </td>
  );
}

function VerticalHeaderCell({ children }: { children: string }) {
  return (
    <th className="relative h-[74px] w-[36px] border border-black bg-slate-50 p-0 align-middle print:bg-white">
      <span className="absolute left-1/2 top-1/2 block -translate-x-1/2 -translate-y-1/2 -rotate-90 whitespace-nowrap text-[8.4px] font-black leading-none">
        {children}
      </span>
    </th>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-h-0 border-b border-black last:border-b-0">
      <div className="grid h-full grid-cols-[76px_1fr]">
        <div className="flex items-start border-r border-black px-1.5 py-1 font-bold">
          <span>{label}</span>
        </div>
        <div className="flex items-start px-1.5 py-1">
          <span>{value}</span>
        </div>
      </div>
    </div>
  );
}

function SignatureLine({
  name,
  signatureDataUrl,
}: {
  name: string;
  signatureDataUrl: string;
}) {
  return (
    <span className="inline-flex min-h-7 min-w-36 items-end border-b border-black align-bottom">
      {signatureDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={signatureDataUrl}
          alt={`Подпис - ${name}`}
          className="max-h-7 max-w-36 object-contain"
        />
      ) : (
        <span className="px-1 font-bold">{name}</span>
      )}
    </span>
  );
}

type ServiceMaintenancePrintPageProps = {
  searchParams: SearchParams;
};

export default async function ServiceMaintenancePrintPage({
  searchParams,
}: ServiceMaintenancePrintPageProps) {
  const query = await searchParams;
  const companySettings = await readCompanyPrintSettings();
  const today = new Date();
  const fallbackDate = formatDate(today);
  const protocolYear = today.getFullYear();
  const protocolNumber = valueFromQuery(
    query,
    "protocolNumber",
    "PR-2026-0418"
  );
  const client = valueFromQuery(query, "client", "Шумен Ритейл Груп АД");
  const objectName = valueFromQuery(query, "objectName", "МОЛ Шумен");
  const address = valueFromQuery(
    query,
    "address",
    "бул. Симеон Велики 46, 9700 Шумен"
  );
  const technician = valueFromQuery(query, "technician", "Иван Петров");
  const contact = valueFromQuery(query, "contact", "Мария Георгиева");
  const protocolDate = valueFromQuery(query, "date", "");
  const currentDate = formatDateValue(protocolDate, fallbackDate);
  const previewId = valueFromQuery(query, "previewId", "");
  const embedded = valueFromQuery(query, "embedded", "") === "1";
  const checks = parseChecks(valueFromQuery(query, "checks", "{}"));
  const serviceDefects = valueFromQuery(query, "serviceDefects", "");
  const serviceDeviations = valueFromQuery(query, "serviceDeviations", "");
  const serviceSystemStatus = valueFromQuery(
    query,
    "serviceSystemStatus",
    ""
  );
  const companyName = valueFromSettingsOrQuery(
    companySettings.companyName,
    query,
    "companyName",
    "Пожарен Контрол ЕООД"
  );
  const companyAddress = valueFromSettingsOrQuery(
    companySettings.address,
    query,
    "companyAddress",
    "гр. Шумен, ул. “Владайско въстание” No 152"
  );
  const companyPhone = valueFromSettingsOrQuery(companySettings.phone, query, "companyPhone", "0896 089 991");
  const companyEmail = valueFromSettingsOrQuery(
    companySettings.email,
    query,
    "companyEmail",
    "office@firecontrol.bg"
  );
  const nextVisitDate = valueFromQuery(query, "nextVisitDate", "");
  const faultValues = [
    serviceDefects,
    serviceDeviations,
    serviceSystemStatus,
    formatDateValue(nextVisitDate, ""),
  ];
  const clientSignerName = contact || client;

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-black print:bg-white print:p-0">
      {embedded ? null : (
        <div className="no-print mx-auto mb-4 flex w-full max-w-[800px] justify-end">
          <PrintButton />
        </div>
      )}

      <article className="print-document mx-auto w-full max-w-[980px] bg-white p-6 text-[9.8px] leading-[1.18] shadow-sm print:p-0 print:shadow-none">
        <header className="avoid-break border border-black">
          <div className="grid grid-cols-[1.05fr_1.35fr_1.05fr]">
            <div className="border-r border-black p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/firecontrol-header-logo.png"
                alt="FireControl"
                className="h-auto w-32 object-contain object-left"
              />
              <div className="mt-1 text-[8px] font-bold uppercase tracking-wide text-slate-800 print:text-black">
                Пожарна безопасност и сервиз
              </div>
              <div className="mt-3 text-[8.5px] leading-3 text-slate-700 print:text-black">
                {companyAddress}
                <br />
                Тел.: {companyPhone}
                <br />
                {companyEmail}
              </div>
            </div>

            <div className="flex flex-col justify-center p-3 text-center">
              <h1 className="text-[19px] font-black leading-tight tracking-wide">
                ПРОТОКОЛ ЗА ПОДДРЪЖКА НА ПИС
              </h1>
              <div className="mx-auto mt-3 grid max-w-[260px] grid-cols-2 overflow-hidden rounded-sm border border-black text-[9.5px]">
                <div className="border-r border-black bg-slate-50 px-2 py-1 print:bg-white">
                  № <span className="font-bold">{protocolNumber}</span>
                </div>
                <div className="bg-slate-50 px-2 py-1 print:bg-white">
                  Дата <span className="font-bold">{currentDate}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-rows-4 border-l border-black text-[9.5px]">
              <InfoItem label="Клиент" value={client} />
              <InfoItem label="Обект" value={objectName} />
              <InfoItem label="Адрес" value={address} />
              <InfoItem label="Техник" value={technician} />
            </div>
          </div>
        </header>

        <section className="avoid-break mt-3 border border-black bg-slate-50 px-3 py-2.5 print:bg-white">
          <p className="text-[9.8px] font-semibold leading-4 text-slate-900 print:text-black">
            Днес {currentDate} г., на основание сключен договор за поддръжка на
            пожароизвестителна система, инсталирана на територията на обект:
            {" "}
            <span className="font-black">{objectName}</span>, находящ се на
            адрес: <span className="font-black">{address}</span>, от персонала
            на фирма “{companyName}” с регистрация, съгласно
            националните изисквания.
          </p>
        </section>

        <section className="mt-2.5">
          <h2 className="border border-b-0 border-black bg-slate-50 px-2 py-1 text-center text-[9.8px] font-black print:bg-white">
            I. Раздел “Превантивна поддръжка”, съгласно т.А.8.а на “Приложение
            А” към стандарта на БДС EN 16763
          </h2>

          <table className="w-full table-fixed border-collapse border-2 border-black text-[9.2px]">
            <thead>
              <tr>
                <th className="w-[38px] border border-black bg-slate-50 px-0.5 py-1 text-center align-middle text-[9.5px] print:bg-white">
                  No
                </th>
                <th className="border border-black bg-slate-50 px-4 py-2 text-center align-top text-[10.2px] font-semibold leading-[1.18] print:bg-white">
                  Дейности, съгласно изискванията на договора за поддръжка,
                  зададените от производителя данни за компонентите и за
                  системата и в съответствие с т. 12 на стандарта СД
                  CEN/TS54-14:2019
                </th>
                <VerticalHeaderCell>Изпълнено</VerticalHeaderCell>
                <VerticalHeaderCell>Неизпълнено</VerticalHeaderCell>
                <VerticalHeaderCell>Неприложимо</VerticalHeaderCell>
              </tr>
            </thead>
            <tbody>
              {checklistRows.map((row) => {
                const checkValue = checkValueForRow(checks, row.number);

                return (
                <tr key={row.number} className={row.heading ? "font-black" : ""}>
                  <td className="border border-black px-0.5 py-0.5 text-center align-middle text-[9.2px]">
                    {row.number}
                  </td>
                  <td className="border border-black px-1.5 py-0.5 align-middle text-[9.2px] leading-[1.16]">
                    {row.activity}
                  </td>
                  <CheckCell checked={checkValue === "Изпълнено"} />
                  <CheckCell checked={checkValue === "Неизпълнено"} />
                  <CheckCell checked={checkValue === "Неприложимо"} />
                </tr>
              );
              })}
            </tbody>
          </table>
        </section>

        <section className="mt-2.5">
          <h2 className="border border-b-0 border-black bg-slate-50 px-2 py-1 text-center text-[9.8px] font-black print:bg-white">
            II. Раздел “Отстраняване на грешки”, съгласно т.А.8.b на “Приложение
            А” към стандарта БДС EN 16763:2017
          </h2>

          <table className="w-full table-fixed border-collapse border-2 border-black text-[9.5px]">
            <tbody>
              {faultRows.map((row, index) => {
                const value = faultValues[index]?.trim();

                return (
                  <tr key={row}>
                    <td className="w-[38px] border border-black px-0.5 py-1 text-center align-top font-black">
                      {index + 1}.
                    </td>
                    <td className="w-[260px] border border-black bg-slate-50 px-2 py-1 align-top font-black leading-4 print:bg-white">
                      {row}
                    </td>
                    <td className="border border-black px-2 py-1 align-top leading-4">
                      {value || <span className="text-slate-400 print:text-black">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <footer className="avoid-break mt-3">
          <div className="grid grid-cols-2 gap-8">
            <div className="min-h-[92px] pt-1">
              <div className="text-[10px] font-black italic leading-4">
                Персонал, изпълняващ функцията на стандарта БДС EN 16763:2017
              </div>
              <div className="mt-8 text-[10px]">
                Име, подпис:{" "}
                <PrintSignatureLine
                  previewId={previewId}
                  role="technician"
                  fallbackName={technician}
                  showNameWithSignature
                  namePlacement="below"
                />
              </div>
            </div>

            <div className="min-h-[92px] pt-1">
              <div className="text-[10px] font-bold italic leading-4">
                Клиент: Всяка работа бе разрешена от мен и изпълнена според
                изискванията ми
              </div>
              <div className="mt-8 text-[10px]">
                Име, подпис:{" "}
                <PrintSignatureLine
                  previewId={previewId}
                  role="client"
                  fallbackName={clientSignerName}
                  showNameWithSignature
                  namePlacement="below"
                />
              </div>
            </div>
          </div>

        </footer>
      </article>

      <PrintPhotoAttachments
        previewId={previewId}
        protocolNumber={protocolNumber}
        protocolDate={currentDate}
        objectName={objectName}
        clientName={client}
        serviceName={valueFromQuery(query, "service", "")}
        technician={technician}
      />

      <style>{`
        @page {
          size: A4;
          margin: 5mm;
        }

        @media print {
          html,
          body {
            background: white !important;
            color: black !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          main {
            min-height: auto !important;
            padding: 0 !important;
          }

          .no-print {
            display: none !important;
          }

          .print-document {
            box-shadow: none !important;
            border-radius: 0 !important;
            box-sizing: border-box !important;
            min-height: auto !important;
            width: 200mm !important;
            max-width: 200mm !important;
            margin: 0 auto !important;
            overflow: visible !important;
          }

          .print-document footer {
            margin-top: 6mm !important;
            padding-top: 0 !important;
          }

          thead {
            display: table-header-group;
          }

          section,
          footer,
          .avoid-break,
          tr,
          td,
          th {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          table {
            border-collapse: collapse !important;
          }

          .photo-attachments {
            break-before: page;
            page-break-before: always;
          }
        }
      `}</style>
    </main>
  );
}
