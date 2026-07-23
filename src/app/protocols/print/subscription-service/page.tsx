import { PrintButton } from "../../../../components/print-button";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { PrintPhotoAttachments, PrintSignatureLine } from "../signature-preview";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type ChecklistState = "good" | "bad" | null;

const COMPANY_SETTINGS_KEY = "firecontrol:settings:company";

type CompanyPrintSettings = {
  companyName: string;
  address: string;
  phone: string;
  email: string;
};

type SubscriptionProtocolData = {
  protocolNumber: string;
  date: string;
  clientName: string;
  objectName: string;
  address: string;
  technician: string;
  serviceName: string;
  serviceCode: string;
  contractReference: string;
  clientRepresentative: string;
  personnelFunctions: {
    A: boolean;
    B: boolean;
    C: boolean;
  };
  checklistStates: Record<string, ChecklistState>;
  checklistNotes: Record<string, string>;
  serviceQuality: "happy" | "neutral" | "sad" | null;
  previewId: string;
  technicianSignature: string;
  technicianSignatureDataUrl: string;
  clientSignature: string;
  clientSignatureDataUrl: string;
  notes: string;
};

const mockProtocolData: SubscriptionProtocolData = {
  protocolNumber: "PR-2026-0418",
  date: "2026-04-12",
  clientName: "Шумен Ритейл Груп АД",
  objectName: "МОЛ Шумен",
  address: "бул. Симеон Велики 46, 9700 Шумен",
  technician: "Иван Петров",
  serviceName: "Сервиз A",
  serviceCode: "A",
  contractReference: "№ FC-2026-018",
  clientRepresentative: "Мария Георгиева",
  personnelFunctions: {
    A: true,
    B: false,
    C: false,
  },
  checklistStates: {
    "1.": "good",
    "2.": "good",
    "3.": "good",
    "4.": "good",
    "5.": "good",
    "6.": "good",
    "7.": "good",
    "8.": "good",
  },
  checklistNotes: {},
  serviceQuality: "happy",
  previewId: "",
  technicianSignature: "Иван Петров",
  technicianSignatureDataUrl: "",
  clientSignature: "Мария Георгиева",
  clientSignatureDataUrl: "",
  notes: "Системата е оставена в работен режим.",
};

const protocolRows = [
  {
    number: "1.",
    work: [
      "Външен оглед на възлите на ПГИ",
      "- Проверка контролни уреди за налягане в КСК",
      "- Проверка връзки",
      "- Визуална проверка спринклерни глави",
      "- Проверка уредите за електронен контрол",
      "- Проверка крепежните елементи на системата",
    ],
    periodicity: "ежемесечно",
  },
  {
    number: "2.",
    work: [
      "Проверка на блоковете за управление и работа на ПГИ в ръчен и автоматичен режим",
    ],
    periodicity: "на три месеца (3/6/9/12)",
  },
  {
    number: "3.",
    work: ["Тест изправността и напрежението на линиите за активиране на ПГИ"],
    periodicity: "ежемесечно",
  },
  {
    number: "4.",
    work: ["Тест работата на ПГИ в режим местно и дистанционно управление"],
    periodicity: "ежемесечно",
  },
  {
    number: "5.",
    work: [
      "Проверка на изправността на изнесените сигнализатори за тревога / сирени, алармени звънци, блиц лампи и др.",
    ],
    periodicity: "годишно (12)",
  },
  {
    number: "6.",
    work: ['Тест на ПГИ в „Автономен“ и „Ръчен“ режим на активиране'],
    periodicity: "годишно",
  },
  {
    number: "7.",
    work: ["Проверка на данните за работа на ПГИ"],
    periodicity: "на три месеца",
  },
  {
    number: "8.",
    work: ["Хардуерен тест на контролните устройства"],
    periodicity: "годишно",
  },
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

function listFromQuery(
  query: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = query[key];
  const rawValue = Array.isArray(value) ? value[0] : value;

  return rawValue ? rawValue.split(",").filter(Boolean) : [];
}

function checklistStatesFromQuery(
  query: Record<string, string | string[] | undefined>
) {
  const goodRows = listFromQuery(query, "goodRows");
  const badRows = listFromQuery(query, "badRows");

  if (!goodRows.length && !badRows.length) {
    return mockProtocolData.checklistStates;
  }

  return {
    ...Object.fromEntries(goodRows.map((rowNumber) => [rowNumber, "good"])),
    ...Object.fromEntries(badRows.map((rowNumber) => [rowNumber, "bad"])),
  } as Record<string, ChecklistState>;
}

function checklistNotesFromQuery(
  query: Record<string, string | string[] | undefined>
) {
  return Object.fromEntries(
    Object.entries(query)
      .filter(([key]) => key.startsWith("rowNote_"))
      .map(([key, value]) => [
        key.replace("rowNote_", ""),
        Array.isArray(value) ? value[0] ?? "" : value ?? "",
      ])
      .filter(([, value]) => value)
  );
}

function personnelFunctionsFromQuery(
  query: Record<string, string | string[] | undefined>
) {
  const selectedFunctions = listFromQuery(query, "personnelFunctions");

  if (!selectedFunctions.length) {
    return mockProtocolData.personnelFunctions;
  }

  return {
    A: selectedFunctions.includes("A"),
    B: selectedFunctions.includes("B"),
    C: selectedFunctions.includes("C"),
  };
}

function serviceQualityFromQuery(
  query: Record<string, string | string[] | undefined>
) {
  const value = valueFromQuery(
    query,
    "serviceQuality",
    mockProtocolData.serviceQuality ?? ""
  );

  if (value === "happy" || value === "neutral" || value === "sad") {
    return value;
  }

  return null;
}

function buildProtocolData(
  query: Record<string, string | string[] | undefined>
): SubscriptionProtocolData {
  return {
    ...mockProtocolData,
    protocolNumber: valueFromQuery(
      query,
      "protocolNumber",
      mockProtocolData.protocolNumber
    ),
    date: valueFromQuery(query, "date", mockProtocolData.date),
    clientName: valueFromQuery(query, "client", mockProtocolData.clientName),
    objectName: valueFromQuery(query, "objectName", mockProtocolData.objectName),
    address: valueFromQuery(query, "address", mockProtocolData.address),
    technician: valueFromQuery(query, "technician", mockProtocolData.technician),
    serviceName: valueFromQuery(
      query,
      "service",
      valueFromQuery(query, "serviceCode", mockProtocolData.serviceCode)
        ? `Сервиз ${valueFromQuery(query, "serviceCode", mockProtocolData.serviceCode)}`
        : mockProtocolData.serviceName
    ),
    serviceCode: valueFromQuery(query, "serviceCode", mockProtocolData.serviceCode),
    contractReference: valueFromQuery(
      query,
      "contractReference",
      mockProtocolData.contractReference
    ),
    clientRepresentative: valueFromQuery(
      query,
      "clientRepresentative",
      valueFromQuery(query, "contact", mockProtocolData.clientRepresentative)
    ),
    personnelFunctions: personnelFunctionsFromQuery(query),
    checklistStates: checklistStatesFromQuery(query),
    checklistNotes: checklistNotesFromQuery(query),
    serviceQuality: serviceQualityFromQuery(query),
    previewId: valueFromQuery(query, "previewId", mockProtocolData.previewId),
    technicianSignature: valueFromQuery(
      query,
      "technicianSignature",
      mockProtocolData.technicianSignature
    ),
    technicianSignatureDataUrl: valueFromQuery(
      query,
      "technicianSignatureDataUrl",
      mockProtocolData.technicianSignatureDataUrl
    ),
    clientSignature: valueFromQuery(
      query,
      "clientSignature",
      mockProtocolData.clientSignature
    ),
    clientSignatureDataUrl: valueFromQuery(
      query,
      "clientSignatureDataUrl",
      mockProtocolData.clientSignatureDataUrl
    ),
    notes: valueFromQuery(query, "notes", mockProtocolData.notes),
  };
}

function dateParts(dateValue: string) {
  const [year, month, day] = dateValue.split("-");

  return {
    day: day ?? "__",
    month: month ?? "__",
    year: year ?? "20____",
    display: day && month && year ? `${day}.${month}.${year}` : dateValue,
  };
}

function MarkCell({ checked }: { checked: boolean }) {
  return (
    <td className="border border-black px-1 py-1 text-center align-middle leading-none">
      <span
        className={`print-checkbox inline-block h-3.5 w-3.5 border border-black align-middle ${
          checked ? "print-checkbox-checked" : ""
        }`}
      />
    </td>
  );
}

function FunctionBox({ checked }: { checked: boolean }) {
  return (
    <span
      className={`print-checkbox inline-block h-3.5 w-3.5 border border-black align-[-2px] ${
        checked ? "print-checkbox-checked" : ""
      }`}
    />
  );
}

function QualityOption({
  label,
  checked,
}: {
  label: string;
  checked: boolean;
}) {
  return (
    <span className="mr-5 inline-flex items-center gap-1.5">
      <span
        className={`print-checkbox inline-block h-3.5 w-3.5 border border-black ${
          checked ? "print-checkbox-checked" : ""
        }`}
      />
      {label}
    </span>
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
    <span className="inline-flex min-h-10 min-w-40 items-end border-b border-black align-bottom">
      {signatureDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={signatureDataUrl}
          alt={`Подпис - ${name}`}
          className="max-h-10 max-w-40 object-contain"
        />
      ) : (
        <span className="px-1 font-bold">{name}</span>
      )}
    </span>
  );
}

type SubscriptionServicePrintPageProps = {
  searchParams: SearchParams;
};

export default async function SubscriptionServicePrintPage({
  searchParams,
}: SubscriptionServicePrintPageProps) {
  const query = await searchParams;
  const companySettings = await readCompanyPrintSettings();
  const protocolData = buildProtocolData(query);
  const protocolDate = dateParts(protocolData.date);
  const embedded = valueFromQuery(query, "embedded", "") === "1";
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

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-black print:bg-white print:p-0">
      {embedded ? null : (
        <div className="no-print mx-auto mb-4 flex w-full max-w-[980px] justify-end">
          <PrintButton />
        </div>
      )}

      <article className="main-protocol mx-auto w-full max-w-[980px] bg-white p-6 text-[9.8px] leading-[1.2] text-black shadow-sm print:m-0 print:max-w-none print:p-0 print:shadow-none">
        <header className="avoid-break border border-black">
          <div className="grid grid-cols-[1.05fr_1.35fr_1.05fr]">
            <div className="border-r border-black p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/firecontrol-header-logo.png"
                alt="FireControl"
                className="h-auto w-32 object-contain object-left"
              />
              <div className="mt-1 text-[8.5px] font-bold uppercase leading-tight">
                Пожарна безопасност и сервиз
              </div>
              <div className="mt-3 space-y-0.5 text-[9px] leading-tight">
                <div>{companyAddress}</div>
                <div>Тел.: {companyPhone}</div>
                <div>{companyEmail}</div>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center border-r border-black px-4 py-3 text-center">
              <h1 className="text-[20px] font-black leading-[1.08] tracking-normal">
                ПРОТОКОЛ ЗА<br />
                АБОНАМЕНТНО ОБСЛУЖВАНЕ
              </h1>
              <div className="mt-4 grid w-[78%] grid-cols-2 border border-black text-[10px] leading-tight">
                <div className="border-r border-black px-2 py-1.5">
                  № <span className="font-bold">{protocolData.protocolNumber}</span>
                </div>
                <div className="px-2 py-1.5">
                  Дата <span className="font-bold">{protocolDate.display}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-[0.68fr_1fr] text-[9.8px] leading-tight">
              {[
                ["Клиент", protocolData.clientName],
                ["Обект", protocolData.objectName],
                ["Адрес", protocolData.address],
                ["Техник", protocolData.technician],
              ].map(([label, value], index, rows) => (
                <div key={label} className="contents">
                  <div
                    className={`border-r border-black px-2 py-1.5 font-bold ${
                      index < rows.length - 1 ? "border-b" : ""
                    }`}
                  >
                    {label}
                  </div>
                  <div
                    className={`px-2 py-1.5 ${
                      index < rows.length - 1 ? "border-b border-black" : ""
                    }`}
                  >
                    {value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </header>

        <section className="avoid-break mt-3 border border-black p-3">
          <p className="whitespace-normal break-words text-justify text-[10.6px] font-semibold leading-[1.35]">
            Днес {protocolDate.day} / {protocolDate.month} / {protocolDate.year} г. на основание на сключен договор{" "}
            <span className="font-bold">{protocolData.contractReference}</span>,
            бе извършен абонаментен сервиз на пожарогасителната инсталация,
            намираща се в{" "}
            <span className="font-bold">
              {protocolData.objectName}, {protocolData.address}
            </span>
            . Настоящият протокол е съставен от представител на „{companyName}“,
            {companyAddress}. Абонаментното обслужване обхваща следните
            възли и детайли на инсталацията:
          </p>
        </section>

        <section className="mt-4">
          <h2 className="text-[13px] font-bold leading-tight">
            1. Извършен профилактичен преглед и контролни измервания на
            апаратура:
          </h2>

          <table className="mt-2 w-full table-fixed border-collapse text-[10.8px] leading-[1.18]">
            <colgroup>
              <col className="w-[7%]" />
              <col className="w-[55%]" />
              <col className="w-[18%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
            </colgroup>
            <thead>
              <tr>
                <th
                  rowSpan={2}
                  className="border border-black px-1.5 py-1 text-center align-middle font-bold"
                >
                  №
                </th>
                <th
                  rowSpan={2}
                  className="border border-black px-1.5 py-1 text-center align-middle font-bold"
                >
                  НАИМЕНОВАНИЕ НА РАБОТИТЕ
                </th>
                <th
                  rowSpan={2}
                  className="border border-black px-1.5 py-1 text-center align-middle font-bold"
                >
                  ПЕРИОДИЧНОСТ
                </th>
                <th
                  colSpan={2}
                  className="border border-black px-1.5 py-1 text-center align-middle font-bold"
                >
                  СЪСТОЯНИЕ
                </th>
              </tr>
              <tr>
                <th className="border border-black px-1.5 py-1 text-center align-middle font-normal">
                  добро
                </th>
                <th className="border border-black px-1.5 py-1 text-center align-middle font-normal">
                  лошо
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td
                  colSpan={5}
                  className="border border-black px-1.5 py-1 text-left align-middle font-bold"
                >
                  АПГИ – спринклерна инсталация
                </td>
              </tr>
              {protocolRows.map((row) => {
                const state = protocolData.checklistStates[row.number] ?? null;

                return (
                  <tr key={row.number}>
                    <td className="border border-black px-1.5 py-1 text-center align-top font-normal">
                      {row.number}
                    </td>
                    <td className="whitespace-normal break-words border border-black px-1.5 py-1 align-top">
                      {row.work.map((line) => (
                        <div key={line}>{line}</div>
                      ))}
                      {state === "bad" && protocolData.checklistNotes[row.number] ? (
                        <div className="mt-0.5 text-[10px] leading-tight">
                          <span className="font-bold">Забележка: </span>
                          {protocolData.checklistNotes[row.number]}
                        </div>
                      ) : null}
                    </td>
                    <td className="whitespace-normal break-words border border-black px-1.5 py-1 text-center align-middle">
                      {row.periodicity}
                    </td>
                    <MarkCell checked={state === "good"} />
                    <MarkCell checked={state === "bad"} />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="mt-4 text-[10.8px] leading-[1.28]">
          <div className="whitespace-normal break-words">
            Персонал, изпълняващ функцията A{" "}
            <FunctionBox checked={protocolData.personnelFunctions.A} />, B{" "}
            <FunctionBox checked={protocolData.personnelFunctions.B} />, C{" "}
            <FunctionBox checked={protocolData.personnelFunctions.C} />
            <br />
            на стандарта БДС EN 12845:2015+A1:2020
          </div>
        </section>

        <section className="mt-4 text-[11.2px] leading-[1.3]">
          <div>
            Качество на услугата:{" "}
            <QualityOption
              label="Удовлетворен"
              checked={protocolData.serviceQuality === "happy"}
            />{" "}
            <QualityOption
              label="Неутрален"
              checked={protocolData.serviceQuality === "neutral"}
            />{" "}
            <QualityOption
              label="Неудовлетворен"
              checked={protocolData.serviceQuality === "sad"}
            />
          </div>
        </section>

        {protocolData.notes ? (
          <section className="mt-4 text-[10.8px] leading-[1.28]">
            <span className="font-bold">Забележки: </span>
            <span className="whitespace-normal break-words">
              {protocolData.notes}
            </span>
          </section>
        ) : null}

        <footer className="mt-8">
          <div className="signatures grid grid-cols-2 gap-14 text-[9.8px] leading-[1.35]">
            <div>
              <div className="min-h-12 font-bold italic">
                Персонал, изпълняващ функцията на стандарта БДС EN 12845:2015+A1:2020
              </div>
              <PrintSignatureLine
                previewId={protocolData.previewId}
                role="technician"
                fallbackName={protocolData.technicianSignature || protocolData.technician}
                showFallbackName={false}
                showNameWithSignature
                namePlacement="below"
              />
            </div>
            <div>
              <div className="min-h-12 font-bold italic">
                Клиент: Всяка работа бе разрешена от мен и изпълнена според изискванията ми
              </div>
              <PrintSignatureLine
                previewId={protocolData.previewId}
                role="client"
                fallbackName={protocolData.clientSignature || protocolData.clientRepresentative || protocolData.clientName}
                showFallbackName={false}
                showNameWithSignature
                namePlacement="below"
              />
            </div>
          </div>
        </footer>
      </article>

      <PrintPhotoAttachments
        previewId={protocolData.previewId}
        protocolNumber={protocolData.protocolNumber}
        protocolDate={protocolDate.display}
        objectName={protocolData.objectName}
        clientName={protocolData.clientName}
        serviceName={protocolData.serviceName}
        technician={protocolData.technician}
      />

      <style>{`
        @page {
          size: A4;
          margin: 12mm;
        }

        .print-checkbox {
          position: relative;
        }

        .print-checkbox-checked::after {
          content: "";
          position: absolute;
          left: 3px;
          top: 0px;
          width: 5px;
          height: 9px;
          border: solid #000000;
          border-width: 0 2px 2px 0;
          transform: rotate(45deg);
        }

        @media print {
          html,
          body {
            background: #ffffff !important;
            color: #000000 !important;
            font-family: Arial, sans-serif !important;
          }

          .no-print {
            display: none !important;
          }

          * {
            box-shadow: none !important;
            border-radius: 0 !important;
            color: #000000 !important;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }

          thead {
            display: table-header-group;
          }

          table,
          tr,
          td,
          th,
          section,
          footer,
          .signatures {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          table {
            border-collapse: collapse !important;
          }

          td,
          th {
            border-color: #000000 !important;
          }

          .photo-attachments {
            break-before: page;
            font-family: Arial, sans-serif !important;
          }

          .attachment-header,
          .photo-item {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .attachment-grid {
            break-inside: auto;
          }
        }
      `}</style>
    </main>
  );
}
