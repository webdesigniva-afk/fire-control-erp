"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Flame, Printer, QrCode } from "lucide-react";
import { generateQRCode } from "../../../../lib/qr";
import { createSupabaseBrowserClient } from "../../../../lib/supabase/client";

type DataRecord = Record<string, unknown>;

type EquipmentQrLabel = {
  id: string;
  qrCode: string;
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

function mapEquipment(equipment: DataRecord): EquipmentQrLabel {
  return {
    id: textValue(equipment, ["id"]),
    qrCode: textValue(equipment, ["equipment_qr_code"]),
  };
}

export default function EquipmentQrStickerPage() {
  const params = useParams<{ code?: string | string[] }>();
  const routeCode = Array.isArray(params.code) ? params.code[0] : params.code;
  const decodedCode = useMemo(
    () => (routeCode ? decodeURIComponent(routeCode) : ""),
    [routeCode]
  );
  const [label, setLabel] = useState<EquipmentQrLabel | null>(null);
  const [qrImage, setQrImage] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "error">(
    "loading"
  );
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadLabel() {
      if (!decodedCode) {
        setStatus("missing");
        return;
      }

      try {
        const supabase = createSupabaseBrowserClient();
        const { data: equipmentRow, error } = await supabase
          .from("equipment")
          .select("*")
          .eq("equipment_qr_code", decodedCode)
          .maybeSingle();

        if (!mounted) return;

        if (error) {
          setErrorMessage(
            error.message.includes("equipment_qr_code")
              ? "Липсва QR колоната за оборудване. Пуснете sql/equipment_qr_stability.sql."
              : error.message
          );
          setStatus("error");
          return;
        }

        if (!equipmentRow) {
          setStatus("missing");
          return;
        }

        const equipmentRecord = equipmentRow as DataRecord;
        const nextLabel = mapEquipment(equipmentRecord);
        const nextQrImage = await generateQRCode(nextLabel.qrCode);

        if (!mounted) return;

        setLabel(nextLabel);
        setQrImage(nextQrImage);
        setStatus("ready");

        await supabase
          .from("equipment")
          .update({ equipment_qr_printed_at: new Date().toISOString() })
          .eq("id", nextLabel.id);
      } catch (error) {
        if (!mounted) return;
        setErrorMessage(
          error instanceof Error ? error.message : "QR етикетът не можа да се зареди."
        );
        setStatus("error");
      }
    }

    void loadLabel();

    return () => {
      mounted = false;
    };
  }, [decodedCode]);

  return (
    <main className="equipment-qr-sticker-page min-h-screen bg-slate-100 px-4 py-6 text-slate-950 print:bg-white print:p-0">
      <style>{`
        .equipment-qr-label,
        .equipment-qr-label * {
          box-sizing: border-box;
        }

        .equipment-qr-label {
          font-family: Arial, Helvetica, sans-serif;
          height: 35mm;
          max-height: 35mm;
          max-width: 35mm;
          min-height: 35mm;
          min-width: 35mm;
          width: 35mm;
        }

        .equipment-qr-value {
          overflow-wrap: anywhere;
          word-break: normal;
        }

        @media print {
          @page {
            size: 35mm 35mm;
            margin: 0;
          }

          html,
          body,
          .equipment-qr-sticker-page {
            background: #ffffff !important;
            height: 35mm !important;
            margin: 0 !important;
            min-height: 35mm !important;
            overflow: hidden !important;
            padding: 0 !important;
            width: 35mm !important;
          }

          .equipment-qr-label {
            border-radius: 2.5mm !important;
            box-shadow: none !important;
            height: 35mm !important;
            margin: 0 !important;
            max-height: 35mm !important;
            max-width: 35mm !important;
            min-height: 35mm !important;
            min-width: 35mm !important;
            width: 35mm !important;
          }
        }
      `}</style>

      <div className="mx-auto mb-4 flex max-w-[720px] items-center justify-between print:hidden">
        <div>
          <div className="text-sm font-black text-slate-900">
            QR етикет за оборудване
          </div>
          <div className="mt-1 text-xs font-bold text-slate-500">
            {status === "loading"
              ? "Зареждане..."
              : status === "missing"
                ? "Няма намерено оборудване"
                : status === "error"
                  ? errorMessage
                  : "Готов за печат 35 x 35 mm"}
          </div>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={status !== "ready"}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-black text-white shadow-sm transition hover:bg-red-700 disabled:pointer-events-none disabled:opacity-50"
        >
          <Printer size={16} />
          Принтирай
        </button>
      </div>

      {label ? (
        <section className="equipment-qr-label mx-auto flex items-center justify-center rounded-[2mm] bg-white p-[1.5mm] shadow-2xl ring-1 ring-slate-200">
          <div className="relative flex h-[32mm] w-[32mm] items-center justify-center">
            {qrImage ? (
              <>
                <img
                  src={qrImage}
                  alt="QR код на оборудването"
                  className="h-full w-full object-contain"
                />
                <div className="absolute left-1/2 top-1/2 flex h-[7mm] w-[7mm] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[1mm] border-white bg-red-700 text-white shadow-sm">
                  <Flame size={16} fill="currentColor" strokeWidth={2.5} />
                </div>
              </>
            ) : (
              <QrCode size={72} />
            )}
          </div>
        </section>
      ) : (
        <div className="mx-auto max-w-[720px] rounded-2xl bg-white p-6 text-sm font-bold text-slate-500 shadow-sm">
          {status === "loading"
            ? "Зареждане..."
            : errorMessage || "Няма данни за този QR код."}
        </div>
      )}
    </main>
  );
}
