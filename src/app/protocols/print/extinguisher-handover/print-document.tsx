"use client";

import { useEffect, useMemo, useState } from "react";
import { PrintButton } from "../../../../components/print-button";
import { PrintSignatureLine } from "../signature-preview";

type ExtinguisherProtocolRow = {
  id: string;
  equipmentId?: string;
  rowNumber: string;
  brand?: string;
  model?: string;
  serialNumber?: string;
  identificationMarking: string;
  category: string;
  chargeMassKg: string;
  extinguishingAgentType: string;
  extinguishingAgentTradeName: string;
  serviceType: string;
  resultStatus?: string;
  problemNote?: string;
  serviceDate: string;
  nextServiceDate?: string;
  servicePersonName: string;
  servicePersonSignatureDataUrl: string;
  stickerNumber: string;
};

type PreviewPayload = {
  extinguisherRows?: ExtinguisherProtocolRow[];
};

const ROWS_PER_PAGE = 12;

function formatDate(dateValue: string) {
  if (!dateValue.includes("-")) return dateValue;
  const [year, month, day] = dateValue.split("-");
  return day && month && year ? `${day}.${month}.${year}` : dateValue;
}

function chunkRows(rows: ExtinguisherProtocolRow[]) {
  const pages: ExtinguisherProtocolRow[][] = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_PAGE) {
    const page = rows.slice(i, i + ROWS_PER_PAGE);
    pages.push(page);
  }
  return pages.length ? pages : [[]];
}

function buildDisplayRows(rows: ExtinguisherProtocolRow[]) {
  const normalized = [...rows];
  while (normalized.length < ROWS_PER_PAGE) {
    const index = normalized.length + 1;
    normalized.push({
      id: `empty-${index}`,
      rowNumber: String(index),
      identificationMarking: "",
      category: "",
      chargeMassKg: "",
      extinguishingAgentType: "",
      extinguishingAgentTradeName: "",
      serviceType: "",
      serviceDate: "",
      servicePersonName: "",
      servicePersonSignatureDataUrl: "",
      stickerNumber: "",
    });
  }
  return normalized;
}

export function ExtinguisherPrintDocument({
  protocolNumber,
  date,
  client,
  address,
  region,
  phone,
  technician,
  contact,
  previewId,
  embedded,
  initialRows,
  companyName,
  companyBulstat,
  companyAddress,
  companyPhone,
}: {
  protocolNumber: string;
  date: string;
  client: string;
  address: string;
  region: string;
  phone: string;
  technician: string;
  contact: string;
  previewId: string;
  embedded: boolean;
  initialRows: ExtinguisherProtocolRow[];
  companyName: string;
  companyBulstat: string;
  companyAddress: string;
  companyPhone: string;
}) {
  const [rows, setRows] = useState(initialRows);

  useEffect(() => {
    if (!previewId) return;
    const previewKey = `firecontrol:protocol-preview:${previewId}`;
    try {
      let raw: string | null = null;
      try {
        raw = localStorage.getItem(previewKey);
      } catch {
        raw = null;
      }
      if (!raw) {
        raw = sessionStorage.getItem(previewKey);
      }
      if (!raw) return;

      const parsed = JSON.parse(raw) as PreviewPayload;
      if (Array.isArray(parsed.extinguisherRows) && parsed.extinguisherRows.length > 0) {
        setRows(parsed.extinguisherRows);
      }
    } catch {
      // Keep initialRows.
    }
  }, [previewId]);

  const pages = useMemo(() => chunkRows(rows), [rows]);
  const formattedDate = formatDate(date);
  const ownerAddress = [address, region].filter(Boolean).join(", ");

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-black print:bg-white print:p-0">
      {embedded ? null : (
        <div className="no-print mx-auto mb-4 flex w-full max-w-[1120px] justify-end">
          <PrintButton />
        </div>
      )}

      {pages.map((pageRows, pageIndex) => {
        const displayRows = buildDisplayRows(pageRows);
        return (
          <article
            key={`page-${pageIndex}`}
            className={`mx-auto min-h-[210mm] w-[297mm] max-w-full bg-white px-[8mm] py-[7mm] text-[8px] leading-[1.15] shadow-sm print:m-0 print:min-h-0 print:w-auto print:max-w-none print:p-0 print:shadow-none ${
              pageIndex < pages.length - 1 ? "mb-4 print:mb-0 print:break-after-page" : ""
            }`}
          >
            <header className="border-b border-black pb-1.5">
              <div className="grid grid-cols-[1.05fr_2fr_1.3fr] items-start gap-2">
                <div>
                  <div className="text-[16px] font-black leading-none tracking-tight">FIREControl</div>
                  <div className="mt-1 text-[8px] font-bold">За предаване и приемане на пожарогасители</div>
                </div>

                <div className="text-center">
                  <h1 className="text-[20px] font-black leading-none">ПРОТОКОЛ № {protocolNumber}</h1>
                  <div className="mt-1 text-[8.2px] font-bold">
                    за предаване и приемане на пожарогасители, на които е извършено техническо обслужване,
                    презареждане или хидростатично изпитване
                  </div>
                  <div className="mt-1 text-[8px]">
                    (в комбинация или поотделно)
                  </div>
                </div>

                <div className="text-right text-[7.8px] leading-tight">
                  <div>{companyName}</div>
                  <div>{companyAddress}</div>
                  <div>ЕИК: {companyBulstat}</div>
                  <div>тел.: {companyPhone}</div>
                </div>
              </div>

              <p className="mt-1 text-[7.8px]">
                Днес <span className="font-bold">{formattedDate}</span> г. в гр./с.{" "}
                <span className="font-bold">{region || "________"}</span> ръководителят (упълномощеният представител)
                на „{companyName}“ предаде на собственика (или негов представител) пожарогасителите, на
                които е извършено обслужване, както следва:
              </p>
            </header>

            <section className="mt-1.5">
              <table className="w-full table-fixed border-collapse border border-black text-[6.4px] leading-[1.05]">
                <colgroup>
                  <col className="w-[3.2%]" />
                  <col className="w-[17%]" />
                  <col className="w-[9.5%]" />
                  <col className="w-[8%]" />
                  <col className="w-[8.5%]" />
                  <col className="w-[10%]" />
                  <col className="w-[12.5%]" />
                  <col className="w-[7.5%]" />
                  <col className="w-[9.3%]" />
                  <col className="w-[7.5%]" />
                  <col className="w-[7%]" />
                </colgroup>
                <thead>
                  <tr>
                    <th className="border border-black px-0.5 py-0.5 text-center align-middle">№ по ред</th>
                    <th className="border border-black px-0.5 py-0.5 text-center align-middle">
                      Идентификационна маркировка на всеки пожарогасител (марка, модел, сериен номер и др.)
                    </th>
                    <th className="border border-black px-0.5 py-0.5 text-center align-middle">
                      Категория на пожарогасителя съгласно БДС ISO 11602-2:2002
                    </th>
                    <th className="border border-black px-0.5 py-0.5 text-center align-middle">
                      Маса на зареждания пожарогасител, kg
                    </th>
                    <th className="border border-black px-0.5 py-0.5 text-center align-middle">
                      Вид на пожарогасителното вещество (вода, прах, CO2, и др.)
                    </th>
                    <th className="border border-black px-0.5 py-0.5 text-center align-middle">
                      Търговско наименование на пожарогасителното вещество (при прах или пенообразувател)
                    </th>
                    <th className="border border-black px-0.5 py-0.5 text-center align-middle">
                      Вид на извършеното обслужване (техническо обслужване, презареждане или хидростатично изпитване)
                    </th>
                    <th className="border border-black px-0.5 py-0.5 text-center align-middle">
                      Дата на извършеното обслужване
                    </th>
                    <th className="border border-black px-0.5 py-0.5 text-center align-middle">
                      Име на лицето, извършило обслужването
                    </th>
                    <th className="border border-black px-0.5 py-0.5 text-center align-middle">
                      Подпис на лицето, извършило обслужването
                    </th>
                    <th className="border border-black px-0.5 py-0.5 text-center align-middle">Номер на стикер</th>
                  </tr>
                  <tr>
                    {Array.from({ length: 11 }).map((_, idx) => (
                      <th key={`col-no-${idx + 1}`} className="border border-black px-0.5 py-0.5 text-center align-middle">
                        {idx + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row, rowIndex) => (
                    <tr key={`${row.id}-${rowIndex}`}>
                      <td className="border border-black px-0.5 py-1.5 text-center align-top">
                        {row.rowNumber || rowIndex + 1}
                      </td>
                      <td className="border border-black px-0.5 py-1.5 align-top">
                        {row.identificationMarking || [row.brand, row.model].filter(Boolean).join(" ")}
                      </td>
                      <td className="border border-black px-0.5 py-1.5 align-top">{row.category}</td>
                      <td className="border border-black px-0.5 py-1.5 text-center align-top">{row.chargeMassKg}</td>
                      <td className="border border-black px-0.5 py-1.5 align-top">{row.extinguishingAgentType}</td>
                      <td className="border border-black px-0.5 py-1.5 align-top">{row.extinguishingAgentTradeName}</td>
                      <td className="border border-black px-0.5 py-1.5 align-top">{row.serviceType}</td>
                      <td className="border border-black px-0.5 py-1.5 text-center align-top">
                        {row.serviceDate ? formatDate(row.serviceDate) : ""}
                      </td>
                      <td className="border border-black px-0.5 py-1.5 align-top">{row.servicePersonName}</td>
                      <td className="border border-black px-0.5 py-1.5 text-center align-middle">
                        {row.servicePersonName ? (
                          <PrintSignatureLine
                            previewId={previewId}
                            role="technician"
                            fallbackName={row.servicePersonName}
                            className="inline-flex min-h-6 min-w-16 items-center justify-center"
                            imageClassName="max-h-6 max-w-16 object-contain"
                            showFallbackName={false}
                          />
                        ) : null}
                      </td>
                      <td className="border border-black px-0.5 py-1.5 text-center align-top">{row.stickerNumber}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="mt-1.5 text-[7.8px]">
              <div>
                Собственик на пожарогасителя/ите:{" "}
                <span className="font-bold">{client || "____________________"}</span>{" "}
                адрес: <span className="font-bold">{ownerAddress || "____________________"}</span>{" "}
                тел.: <span className="font-bold">{phone || "________"}</span>
              </div>
              <div className="mt-1">
                Този протокол се състави в два еднообразни екземпляра - по един за организацията, извършила
                обслужването, и за собственика на пожарогасителя/ите.
              </div>
            </section>

            <footer className="mt-2 grid grid-cols-3 gap-4 text-[7.8px]">
              <div>
                <div className="font-bold">ПРЕДАЛ:</div>
                <div className="text-[7px]">(извършил обслужването)</div>
                <div className="mt-2 h-10 border-b border-black">
                  <PrintSignatureLine
                    previewId={previewId}
                    role="technician"
                    fallbackName={technician}
                    className="inline-flex h-full w-full items-center justify-center"
                    imageClassName="max-h-9 max-w-32 object-contain"
                    showFallbackName={false}
                  />
                </div>
                <div className="mt-1 text-center font-bold">{technician || "________"}</div>
                <div className="text-center text-[7px]">(име и подпис)</div>
              </div>

              <div>
                <div className="font-bold">ПРИЕЛ:</div>
                <div className="text-[7px]">(собственик/представител)</div>
                <div className="mt-2 h-10 border-b border-black">
                  <PrintSignatureLine
                    previewId={previewId}
                    role="client"
                    fallbackName={contact}
                    className="inline-flex h-full w-full items-center justify-center"
                    imageClassName="max-h-9 max-w-32 object-contain"
                    showFallbackName={false}
                  />
                </div>
                <div className="mt-1 text-center font-bold">{contact || "________"}</div>
                <div className="text-center text-[7px]">(име и подпис)</div>
              </div>

              <div className="flex items-end justify-end text-right text-[7px]">
                Страница {pageIndex + 1} от {pages.length}
              </div>
            </footer>

            <div className="mt-1 border-t border-black pt-1 text-[7px]">
              Забележка. Протоколът се съхранява до времето за извършване на следващото техническо обслужване,
              презареждане или хидростатично изпитване.
            </div>
          </article>
        );
      })}

      <style>{`
        @page {
          size: A4 landscape;
          margin: 8mm;
        }
        @media print {
          html,
          body {
            background: #fff !important;
            color: #000 !important;
          }
          .no-print {
            display: none !important;
          }
          * {
            box-shadow: none !important;
            border-radius: 0 !important;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          table {
            border-collapse: collapse !important;
          }
          tr,
          td,
          th {
            page-break-inside: avoid;
            break-inside: avoid;
          }
        }
      `}</style>
    </main>
  );
}
