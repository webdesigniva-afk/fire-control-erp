"use client";

import { useEffect, useState } from "react";
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

function formatDate(dateValue: string) {
  if (!dateValue.includes("-")) return dateValue;
  const [year, month, day] = dateValue.split("-");
  return day && month && year ? `${day}.${month}.${year}` : dateValue;
}

export function ExtinguisherRowsPreview({
  previewId,
  initialRows,
}: {
  previewId: string;
  initialRows: ExtinguisherProtocolRow[];
}) {
  const [rows, setRows] = useState(initialRows);

  useEffect(() => {
    if (!previewId) return;
    const previewKey = `firecontrol:protocol-preview:${previewId}`;

    try {
      let storedPayload: string | null = null;
      try {
        storedPayload = localStorage.getItem(previewKey);
      } catch {
        storedPayload = null;
      }
      if (!storedPayload) {
        storedPayload = sessionStorage.getItem(previewKey);
      }
      if (!storedPayload) return;

      const payload = JSON.parse(storedPayload) as PreviewPayload;
      if (Array.isArray(payload.extinguisherRows) && payload.extinguisherRows.length) {
        setRows(payload.extinguisherRows);
      }
    } catch {
      // Keep initial rows if preview payload is unavailable.
    }
  }, [previewId]);

  return (
    <tbody>
      {rows.map((row) => (
        <tr key={row.id}>
          <td className="border border-black px-0.5 py-1 text-center align-top">
            {row.rowNumber}
          </td>
          <td className="whitespace-normal break-words border border-black px-0.5 py-1 align-top">
            {row.identificationMarking || [row.brand, row.model].filter(Boolean).join(" ")}
          </td>
          <td className="whitespace-normal break-words border border-black px-0.5 py-1 align-top">
            {row.category}
          </td>
          <td className="whitespace-normal break-words border border-black px-0.5 py-1 text-center align-top">
            {row.chargeMassKg}
          </td>
          <td className="whitespace-normal break-words border border-black px-0.5 py-1 align-top">
            {row.extinguishingAgentType}
          </td>
          <td className="whitespace-normal break-words border border-black px-0.5 py-1 align-top">
            {row.extinguishingAgentTradeName}
          </td>
          <td className="whitespace-normal break-words border border-black px-0.5 py-1 align-top">
            {row.serviceType}
          </td>
          <td className="whitespace-normal break-words border border-black px-0.5 py-1 text-center align-top">
            {formatDate(row.serviceDate)}
          </td>
          <td className="whitespace-normal break-words border border-black px-0.5 py-1 align-top">
            {row.servicePersonName}
          </td>
          <td className="border border-black px-0.5 py-1 text-center align-middle">
            <PrintSignatureLine
              previewId={previewId}
              role="technician"
              fallbackName={row.servicePersonName}
              className="inline-flex min-h-7 min-w-20 items-center justify-center"
              imageClassName="max-h-7 max-w-20 object-contain"
              showFallbackName={false}
            />
          </td>
          <td className="whitespace-normal break-words border border-black px-0.5 py-1 text-center align-top">
            {row.stickerNumber}
          </td>
        </tr>
      ))}
    </tbody>
  );
}
