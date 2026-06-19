import { PrintButton } from "../../../../components/print-button";
import { PrintPhotoAttachments, PrintSignatureLine } from "../signature-preview";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

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
    <th className="relative h-[78px] w-[30px] border-2 border-black p-0 align-middle">
      <span className="absolute left-1/2 top-1/2 block -translate-x-1/2 -translate-y-1/2 -rotate-90 whitespace-nowrap text-[8.5px] font-black leading-none">
        {children}
      </span>
    </th>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-black last:border-b-0">
      <div className="grid grid-cols-[76px_1fr]">
        <div className="border-r border-black px-1.5 py-1 font-bold">
          {label}
        </div>
        <div className="px-1.5 py-1">{value}</div>
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
  const companyName = valueFromQuery(query, "companyName", "Пожарен Контрол ЕООД");
  const companyAddress = valueFromQuery(
    query,
    "companyAddress",
    "гр. Шумен, ул. “Владайско въстание” No 152"
  );
  const companyPhone = valueFromQuery(query, "companyPhone", "0896 089 991");
  const companyEmail = valueFromQuery(query, "companyEmail", "support@firecontrol.bg");
  const nextVisitDate = valueFromQuery(query, "nextVisitDate", "");
  const faultValues = [
    serviceDefects,
    serviceDeviations,
    serviceSystemStatus,
    nextVisitDate,
  ];

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-black print:bg-white print:p-0">
      {embedded ? null : (
        <div className="no-print mx-auto mb-4 flex w-full max-w-[800px] justify-end">
          <PrintButton />
        </div>
      )}

      <article className="mx-auto w-full max-w-[760px] bg-white p-6 text-[9.5px] leading-[1.16] shadow-sm print:min-h-0 print:max-w-none print:p-0 print:shadow-none">
        <header className="avoid-break border-2 border-black">
          <div className="grid grid-cols-[1fr_1.45fr_1fr]">
            <div className="border-r-2 border-black p-2">
              <div className="text-[18px] font-black tracking-tight">
                FIRE<span className="text-orange-600 print:text-black">Control</span>
              </div>
              <div className="mt-0.5 text-[8.5px] font-bold uppercase tracking-wide">
                Пожарна безопасност и сервиз
              </div>
              <div className="mt-1.5 text-[8.5px] leading-3">
                {companyAddress}
                <br />
                GSM: {companyPhone}
                <br />
                {companyEmail}
              </div>
            </div>

            <div className="p-2 text-center">
              <h1 className="text-[22px] font-black leading-tight tracking-wide">
                ПРОТОКОЛ ЗА ПОДДРЪЖКА НА ПИС
              </h1>
              <div className="mx-auto mt-2 grid max-w-[240px] grid-cols-2 border border-black text-[10px]">
                <div className="border-r border-black px-1.5 py-1">
                  № <span className="font-bold">{protocolNumber}</span>
                </div>
                <div className="px-1.5 py-1">
                  Дата <span className="font-bold">{currentDate}</span>
                </div>
              </div>
            </div>

            <div className="border-l-2 border-black text-[10px]">
              <InfoItem label="Клиент" value={client} />
              <InfoItem label="Обект" value={objectName} />
              <InfoItem label="Адрес" value={address} />
              <InfoItem label="Техник" value={technician} />
            </div>
          </div>
        </header>

        <section className="avoid-break mt-2.5 border border-black bg-slate-50 p-2 print:bg-white">
          <p className="text-[10.5px] font-bold leading-4">
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
          <h2 className="border-2 border-b-0 border-black px-2 py-1 text-center text-[10.5px] font-black">
            I. Раздел “Превантивна поддръжка”, съгласно т.А.8.а на “Приложение
            А” към стандарта на БДС EN 16763
          </h2>

          <table className="w-full table-fixed border-collapse border-2 border-black text-[8.8px]">
            <thead>
              <tr>
                <th className="w-[34px] border-2 border-black px-0.5 py-1 text-center align-top text-[10px]">
                  No
                </th>
                <th className="border-2 border-black px-2 py-1 text-center align-top text-[10.5px] font-black leading-[1.05]">
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
                  <td className="border border-black px-0.5 py-0.5 text-center align-middle text-[9.5px]">
                    {row.number}
                  </td>
                  <td className="border border-black px-1.5 py-0.5 align-middle text-[9px] leading-[1.08]">
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
          <h2 className="border-2 border-b-0 border-black px-2 py-1 text-center text-[10.5px] font-black">
            II. Раздел “Отстраняване на грешки”, съгласно т.А.8.b на “Приложение
            А” към стандарта БДС EN 16763:2017
          </h2>

          <div className="border-2 border-black">
            {faultRows.map((row, index) => (
              <div key={row} className={index > 0 ? "border-t border-black" : ""}>
                <div className="grid grid-cols-[34px_1fr] border-b border-black text-[10.5px] font-bold">
                  <div className="border-r border-black px-0.5 py-0.5 text-center">
                    {index + 1}.
                  </div>
                  <div className="px-2 py-0.5">{row}</div>
                </div>
                <div
                  className={`px-2 py-1 text-[9.5px] leading-4 ${
                    index === 0 ? "min-h-11" : index === 2 ? "min-h-8" : "min-h-7"
                  }`}
                >
                  {faultValues[index] || ""}
                </div>
              </div>
            ))}
          </div>
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
                />
              </div>
              <div className="mt-3 text-[10px]">
                Дата:{" "}
                <span className="inline-block min-w-24 border-b border-black">
                  {currentDate}
                </span>
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
                  fallbackName={contact}
                />
              </div>
              <div className="mt-3 text-[10px]">
                Дата:{" "}
                <span className="inline-block min-w-24 border-b border-black">
                  {currentDate}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-2.5 flex items-end justify-between">
            <div className="h-14 w-44 border border-black" aria-hidden="true" />
            <div className="text-right">
              <div className="text-[17px] font-black tracking-tight">
                FIRE<span className="text-orange-600 print:text-black">Control</span>
              </div>
              <div className="text-[9px] font-bold">
                Prepared by: Fire Control Ltd.
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
          margin: 8mm;
        }

        @media print {
          html,
          body {
            background: white !important;
            color: black !important;
          }

          .no-print {
            display: none !important;
          }

          article {
            box-shadow: none !important;
            border-radius: 0 !important;
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
        }
      `}</style>
    </main>
  );
}
