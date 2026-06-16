"use client";

import { useEffect, useMemo, useState } from "react";
import { Barcode, Download, Printer, QrCode, ToggleLeft } from "lucide-react";
import { AppShell } from "./app-shell";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { generateQRCode } from "../lib/qr";

type LabelType = "qr" | "service" | "extinguisher";
type LabelSize = "50x30 mm" | "60x40 mm" | "70x50 mm" | "A4 (sheet)";

type LabelTemplateEditorProps = {
  type: LabelType;
};

const sizeOptions: LabelSize[] = [
  "50x30 mm",
  "60x40 mm",
  "70x50 mm",
  "A4 (sheet)",
];

const sizeConfig: Record<LabelSize, { width: number; height: number; label: string }> = {
  "50x30 mm": { width: 430, height: 258, label: "50 x 30 mm" },
  "60x40 mm": { width: 500, height: 333, label: "60 x 40 mm" },
  "70x50 mm": { width: 560, height: 400, label: "70 x 50 mm" },
  "A4 (sheet)": { width: 520, height: 735, label: "A4 лист" },
};

const pageCopy: Record<LabelType, { title: string; description: string }> = {
  qr: {
    title: "QR етикет за обект",
    description:
      "Редактор за входен етикет, който отваря дигиталния паспорт на обекта",
  },
  service: {
    title: "Сервизен стикер",
    description:
      "Редактор за сервизен стикер след техническа поддръжка и проверка",
  },
  extinguisher: {
    title: "Етикет за пожарогасител",
    description:
      "Редактор за идентификационен етикет на пожарогасител и оборудване",
  },
};

function FieldLabel({ children }: { children: string }) {
  return (
    <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">
      {children}
    </span>
  );
}

function BarcodeMock() {
  const bars = [6, 2, 4, 1, 7, 3, 5, 2, 6, 1, 4, 7, 2, 5, 3, 6, 1, 4];

  return (
    <div className="flex h-12 items-end gap-0.5">
      {bars.map((height, index) => (
        <span
          key={`${height}-${index}`}
          className="w-1 bg-slate-950"
          style={{ height: `${height * 6}px` }}
        />
      ))}
    </div>
  );
}

function ToggleButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-black transition ${
        active
          ? "border-orange-200 bg-orange-50 text-orange-700"
          : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
      }`}
    >
      <ToggleLeft size={17} className={active ? "text-orange-500" : ""} />
      {children}
    </button>
  );
}

function QrLabelPreview({ qrDataUrl }: { qrDataUrl: string | null }) {
  return (
    <div className="flex h-full flex-col justify-between bg-white p-[6%] text-slate-950">
      <div className="flex items-start justify-between gap-5">
        <div>
          <div className="text-[clamp(18px,4vw,30px)] font-black tracking-tight">
            FIRE<span className="text-orange-500">Control</span>
          </div>
          <div className="mt-4 text-[clamp(24px,5vw,42px)] font-black leading-none">
            МОЛ Шумен
          </div>
          <div className="mt-2 text-[clamp(12px,2vw,18px)] font-bold text-slate-500">
            Дигитален паспорт на обекта
          </div>
        </div>
        <div className="flex aspect-square w-[34%] items-center justify-center border-2 border-slate-900 bg-white p-2">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="QR код на обекта" className="h-full w-full" />
          ) : (
            <QrCode className="h-2/3 w-2/3 text-slate-300" />
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 border-t border-slate-300 pt-4 text-[clamp(11px,2vw,16px)] font-black">
        <div>
          <FieldLabel>Обект ID</FieldLabel>
          <div>OBJ-1024</div>
        </div>
        <div className="text-right">
          <FieldLabel>Телефон</FieldLabel>
          <div>0700 11 911</div>
        </div>
      </div>
    </div>
  );
}

function ServiceLabelPreview() {
  return (
    <div className="flex h-full flex-col justify-between bg-white p-[6%] text-slate-950">
      <div className="flex items-center justify-between border-b-2 border-slate-950 pb-3">
        <div>
          <div className="text-[clamp(16px,3vw,28px)] font-black">
            FIRE<span className="text-orange-500">Control</span>
          </div>
          <div className="text-[clamp(10px,2vw,14px)] font-bold uppercase tracking-wide text-slate-500">
            сервизен стикер
          </div>
        </div>
        <div className="rounded-xl border-2 border-slate-950 px-4 py-2 text-center">
          <div className="text-[clamp(20px,4vw,34px)] font-black leading-none">
            04
          </div>
          <div className="text-[clamp(11px,2vw,16px)] font-black">2026</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-[clamp(10px,2vw,16px)] font-black">
        {["ЯН", "ФЕВ", "МАР", "АПР", "МАЙ", "ЮНИ", "ЮЛИ", "АВГ", "СЕП"].map(
          (month) => (
            <span
              key={month}
              className={
                month === "АПР"
                  ? "rounded-lg bg-gradient-to-r from-red-500 to-orange-400 py-2 text-white"
                  : "rounded-lg border border-slate-300 py-2"
              }
            >
              {month}
            </span>
          ),
        )}
      </div>
      <div className="grid grid-cols-2 gap-4 text-[clamp(11px,2vw,16px)] font-black">
        <div>
          <FieldLabel>Тип протокол</FieldLabel>
          <div>Сервизен</div>
        </div>
        <div>
          <FieldLabel>Номер</FieldLabel>
          <div>PR-2026-0418</div>
        </div>
        <div className="col-span-2">
          <FieldLabel>Сериен номер</FieldLabel>
          <div>SN-FC-10021</div>
        </div>
      </div>
    </div>
  );
}

function ExtinguisherLabelPreview() {
  return (
    <div className="flex h-full flex-col justify-between bg-white p-[6%] text-slate-950">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[clamp(12px,2vw,18px)] font-black uppercase text-orange-600">
            FIREControl
          </div>
          <div className="mt-2 text-[clamp(24px,5vw,44px)] font-black leading-none">
            ABC 6kg
          </div>
          <div className="mt-2 text-[clamp(12px,2vw,18px)] font-bold text-slate-500">
            Пожарогасител
          </div>
        </div>
        <div className="rounded-xl border-2 border-slate-950 px-4 py-3 text-center">
          <FieldLabel>Следв. проверка</FieldLabel>
          <div className="text-[clamp(16px,3vw,26px)] font-black">05.2026</div>
        </div>
      </div>
      <div className="grid grid-cols-[1fr_auto] items-end gap-4 border-t border-slate-300 pt-4">
        <div className="text-[clamp(12px,2vw,18px)] font-black">
          <FieldLabel>Сериен номер</FieldLabel>
          <div>SN-FC-10021</div>
        </div>
        <BarcodeMock />
      </div>
    </div>
  );
}

export function LabelTemplateEditor({ type }: LabelTemplateEditorProps) {
  const [size, setSize] = useState<LabelSize>("70x50 mm");
  const [lightBackground, setLightBackground] = useState(true);
  const [printMode, setPrintMode] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const copy = pageCopy[type];
  const dimensions = sizeConfig[size];

  useEffect(() => {
    if (type !== "qr") {
      return;
    }

    let mounted = true;

    generateQRCode("http://localhost:3000/qr/OBJ-1024").then((dataUrl) => {
      if (mounted) {
        setQrDataUrl(dataUrl);
      }
    });

    return () => {
      mounted = false;
    };
  }, [type]);

  const preview = useMemo(() => {
    if (type === "qr") {
      return <QrLabelPreview qrDataUrl={qrDataUrl} />;
    }

    if (type === "service") {
      return <ServiceLabelPreview />;
    }

    return <ExtinguisherLabelPreview />;
  }, [qrDataUrl, type]);

  return (
    <AppShell title={copy.title} description={copy.description}>
      <div className="space-y-6">
        <Card className="p-5">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <label className="space-y-2">
              <span className="text-xs font-black uppercase tracking-wide text-slate-400">
                Размер
              </span>
              <select
                value={size}
                onChange={(event) => setSize(event.target.value as LabelSize)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 outline-none transition focus:border-orange-300 focus:ring-4 focus:ring-orange-100 lg:w-72"
              >
                {sizeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-col gap-3 sm:flex-row">
              <ToggleButton
                active={lightBackground}
                onClick={() => setLightBackground((value) => !value)}
              >
                светъл фон
              </ToggleButton>
              <ToggleButton
                active={printMode}
                onClick={() => setPrintMode((value) => !value)}
              >
                печатен режим
              </ToggleButton>
            </div>
          </div>
        </Card>

        <Card
          className={`overflow-hidden p-5 ${
            printMode ? "shadow-none" : "shadow-sm"
          }`}
        >
          <div
            className={`flex min-h-[560px] items-center justify-center overflow-auto rounded-3xl border border-dashed p-6 ${
              lightBackground ? "bg-white" : "bg-slate-100"
            } ${printMode ? "border-slate-300" : "border-orange-200"}`}
          >
            <div className="space-y-3">
              <div className="text-center text-xs font-black uppercase tracking-wide text-slate-400">
                Визуализация: {dimensions.label}
              </div>
              <div
                className={`mx-auto overflow-hidden border border-slate-950 bg-white text-slate-950 ${
                  printMode ? "shadow-none" : "shadow-xl shadow-slate-200/80"
                }`}
                style={{
                  width: `min(${dimensions.width}px, 100%)`,
                  aspectRatio: `${dimensions.width} / ${dimensions.height}`,
                }}
              >
                {preview}
              </div>
            </div>
          </div>
        </Card>

        <div className="flex flex-col justify-end gap-3 sm:flex-row">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer size={16} />
            Печатен тест
          </Button>
          <Button variant="secondary">
            <Download size={16} />
            Изтегли като PDF
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
