"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  FileCheck2,
  FileSignature,
  FileText,
  Loader2,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";

type PortalClient = {
  id: string;
  name: string;
  clientType: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
};

type PortalLocation = {
  id: string;
  qrCode: string;
  name: string;
  address: string;
  region: string;
  status: string;
  service: string;
  objectType: string;
};

type DocumentLine = {
  id?: string;
  name?: string;
  description?: string;
  period?: string;
  periodicity?: string;
  object?: string;
  quantity?: number;
  unitPrice?: number;
  price?: number;
};

type OfferPreview = {
  number?: string;
  date?: string;
  validUntil?: string;
  client?: string;
  contact?: string;
  phone?: string;
  email?: string;
  object?: string;
  address?: string;
  preparedBy?: string;
  lines?: DocumentLine[];
};

type ContractPreview = OfferPreview & {
  offerNumber?: string;
  terms?: { id?: string; title?: string; text?: string }[];
};

type DocumentData = {
  offer?: OfferPreview | null;
  contract?: ContractPreview | null;
  totals?: Record<string, unknown> | null;
};

type PortalDocument = {
  id: string;
  kind: string;
  title: string;
  number: string;
  status: string;
  requiresSignature: boolean;
  signatureMethod: string;
  signedAt: string;
  signedByName: string;
  signatureDataUrl: string;
  publishedAt: string;
  href: string;
  total: string;
  objectName: string;
  savedDocumentId: string;
  locationId: string;
  documentData: DocumentData;
};

type PortalProtocol = {
  id: string;
  number: string;
  type: string;
  date: string;
  status: string;
  clientName: string;
  objectName: string;
  technician: string;
  locationId: string;
  objectCode: string;
};

type PortalTask = {
  id: string;
  title: string;
  description: string;
  taskType: string;
  status: string;
  dueDate: string;
  objectId: string;
  objectCode: string;
  objectName: string;
  assignedTo: string;
  completedAt: string;
};

type PortalData = {
  portal: { token: string; lastOpenedAt: string };
  client: PortalClient;
  locations: PortalLocation[];
  documents: PortalDocument[];
  protocols: PortalProtocol[];
  tasks: PortalTask[];
};

type PortalLibraryItem =
  | { id: string; itemType: "document"; sortDate: string; document: PortalDocument }
  | { id: string; itemType: "protocol"; sortDate: string; protocol: PortalProtocol };

function formatDate(value: string | undefined) {
  if (!value) return "Без дата";
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("bg-BG").format(date);
}

function formatAmount(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";
  return `${new Intl.NumberFormat("bg-BG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric)} €`;
}

function textValue(record: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!record) return "";
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function documentKindLabel(kind: string) {
  if (kind === "offer") return "Оферта";
  if (kind === "contract") return "Договор";
  if (kind === "protocol") return "Протокол";
  return "Документ";
}

function taskIsDone(task: PortalTask) {
  const status = task.status.toLowerCase();
  return Boolean(task.completedAt) || ["done", "completed", "resolved", "приключена", "готово"].includes(status);
}

function documentSource(document: PortalDocument) {
  return document.kind === "contract" ? document.documentData?.contract : document.documentData?.offer;
}

function documentLines(document: PortalDocument) {
  const source = documentSource(document);
  return Array.isArray(source?.lines) ? source.lines : [];
}

function documentTotals(document: PortalDocument) {
  const lines = documentLines(document);
  const totals = document.documentData?.totals;
  const subtotal = Number(textValue(totals, ["subtotal"]));
  const total = Number(textValue(totals, ["total"]));
  const vat = Number(textValue(totals, ["vat"]));
  const lineSubtotal = lines.reduce((sum, line) => {
    const quantity = Number(line.quantity) || 1;
    const unitPrice = Number(line.unitPrice) || 0;
    const price = Number(line.price);
    return sum + (Number.isFinite(price) && price > 0 ? price : quantity * unitPrice);
  }, 0);
  const resolvedSubtotal = Number.isFinite(subtotal) && subtotal > 0 ? subtotal : lineSubtotal;
  const resolvedTotal = Number.isFinite(total) && total > 0 ? total : resolvedSubtotal;
  const resolvedVat = Number.isFinite(vat) && vat > 0 ? vat : Math.max(0, resolvedTotal - resolvedSubtotal);
  return { subtotal: resolvedSubtotal, vat: resolvedVat, total: resolvedTotal };
}

function documentStatus(document: PortalDocument) {
  if (document.status === "signed") {
    return document.signatureMethod === "paper" ? "Подписан на хартия" : "Подписан онлайн";
  }
  if (document.requiresSignature) return "Очаква подпис";
  return "Публикуван";
}

function protocolTitle(protocol: PortalProtocol) {
  return protocol.number ? `Протокол ${protocol.number}` : "Протокол";
}

function protocolStatus(protocol: PortalProtocol) {
  if (!protocol.status) return "Издаден";
  if (protocol.status === "signed") return "Подписан";
  if (protocol.status === "completed") return "Приключен";
  return protocol.status;
}

function libraryItemTypeLabel(item: PortalLibraryItem) {
  if (item.itemType === "protocol") return "Протокол";
  return documentKindLabel(item.document.kind);
}

function libraryItemTitle(item: PortalLibraryItem) {
  return item.itemType === "protocol" ? protocolTitle(item.protocol) : item.document.title;
}

function libraryItemObjectName(item: PortalLibraryItem) {
  return item.itemType === "protocol" ? item.protocol.objectName : item.document.objectName;
}

function libraryItemDate(item: PortalLibraryItem) {
  return item.itemType === "protocol" ? item.protocol.date : item.document.publishedAt;
}

function libraryItemStatus(item: PortalLibraryItem) {
  return item.itemType === "protocol" ? protocolStatus(item.protocol) : documentStatus(item.document);
}

function documentNumberIsInTitle(document: PortalDocument) {
  return Boolean(document.number && document.title.toLowerCase().includes(document.number.toLowerCase()));
}

function libraryItemTone(item: PortalLibraryItem): "green" | "orange" | "blue" | "slate" {
  if (item.itemType === "protocol") return "blue";
  if (item.document.status === "signed") return "green";
  if (item.document.requiresSignature) return "orange";
  return "slate";
}

function badgeClass(tone: "green" | "orange" | "blue" | "slate") {
  if (tone === "green") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "orange") return "border-orange-200 bg-orange-50 text-orange-700";
  if (tone === "blue") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function Badge({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: "green" | "orange" | "blue" | "slate";
}) {
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-black ${badgeClass(tone)}`}>
      {children}
    </span>
  );
}

function SignaturePad({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);

  function prepareCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.lineWidth = 2.4;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#0f172a";
    if (value) {
      const image = new Image();
      image.onload = () => context.drawImage(image, 0, 0, rect.width, rect.height);
      image.src = value;
    }
  }

  useEffect(() => {
    prepareCanvas();
    window.addEventListener("resize", prepareCanvas);
    return () => window.removeEventListener("resize", prepareCanvas);
  }, [value]);

  function pointer(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawingRef.current = true;
    canvas.setPointerCapture(event.pointerId);
    const context = canvas.getContext("2d");
    const point = pointer(event);
    context?.beginPath();
    context?.moveTo(point.x, point.y);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const context = canvasRef.current?.getContext("2d");
    const point = pointer(event);
    context?.lineTo(point.x, point.y);
    context?.stroke();
  }

  function finish() {
    const canvas = canvasRef.current;
    if (!canvas || !drawingRef.current) return;
    drawingRef.current = false;
    onChange(canvas.toDataURL("image/png"));
  }

  function clear() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    onChange("");
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        className="h-40 w-full touch-none rounded-2xl border border-dashed border-slate-300 bg-white"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerLeave={finish}
      />
      <button type="button" onClick={clear} className="mt-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-600">
        Изчисти подписа
      </button>
    </div>
  );
}

function documentHtml(document: PortalDocument) {
  const source = documentSource(document);
  const rows = documentLines(document)
    .map((line, index) => {
      const quantity = Number(line.quantity) || 1;
      const unitPrice = Number(line.unitPrice) || 0;
      const price = Number(line.price);
      const total = Number.isFinite(price) && price > 0 ? price : quantity * unitPrice;
      return `<tr>
        <td>${index + 1}</td>
        <td><strong>${escapeHtml(line.name || "Услуга")}</strong><br><span>${escapeHtml(line.description || "")}</span></td>
        <td>${escapeHtml(line.period || line.periodicity || "")}</td>
        <td class="right">${escapeHtml(formatAmount(total))}</td>
      </tr>`;
    })
    .join("");
  const totals = documentTotals(document);
  const signature = document.signatureDataUrl
    ? `<div class="signature"><img src="${escapeHtml(document.signatureDataUrl)}" alt="Подпис"><div>${escapeHtml(document.signedByName || "Клиент")}</div><small>${escapeHtml(formatDate(document.signedAt))}</small></div>`
    : `<div class="signature empty">Няма положен подпис</div>`;

  return `<!doctype html>
  <html lang="bg">
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(document.title)}</title>
    <style>
      @page { size: A4; margin: 14mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #0f172a; font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.45; }
      header { display: grid; grid-template-columns: 1fr 58mm; gap: 12mm; border-bottom: 1px solid #cbd5e1; padding-bottom: 10mm; }
      .brand { font-size: 23pt; font-weight: 900; letter-spacing: -0.5px; }
      .brand span { color: #ea580c; }
      .subtitle, .label { color: #64748b; font-size: 8pt; font-weight: 800; text-transform: uppercase; }
      .meta { border: 1px solid #dbe4ef; border-radius: 8px; padding: 6mm; background: #f8fafc; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10mm; margin-top: 10mm; }
      .value { margin-top: 2mm; font-size: 14pt; font-weight: 900; }
      p { margin: 2mm 0 0; color: #334155; }
      table { width: 100%; margin-top: 10mm; border-collapse: collapse; border: 1px solid #dbe4ef; }
      th { background: #f1f5f9; color: #64748b; font-size: 8pt; text-transform: uppercase; text-align: left; }
      th, td { border-bottom: 1px solid #dbe4ef; padding: 3.5mm; vertical-align: top; }
      td span { color: #475569; }
      .right { text-align: right; white-space: nowrap; }
      .totals { width: 70mm; margin: 8mm 0 0 auto; border: 1px solid #dbe4ef; border-radius: 8px; overflow: hidden; }
      .totals div { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid #dbe4ef; }
      .totals div:last-child { border-bottom: 0; background: #020617; color: white; }
      .totals span, .totals strong { padding: 3.5mm; }
      .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 10mm; margin-top: 14mm; page-break-inside: avoid; }
      .signature { min-height: 28mm; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 4mm; text-align: center; }
      .signature img { max-height: 22mm; max-width: 100%; object-fit: contain; display: block; margin: 0 auto 2mm; }
      .empty { display: flex; align-items: center; justify-content: center; color: #94a3b8; font-weight: 700; }
    </style>
  </head>
  <body>
    <header>
      <div>
        <div class="brand">FIRE<span>Control</span></div>
        <div class="subtitle">${escapeHtml(documentKindLabel(document.kind))} за пожарна безопасност и сервизно обслужване.</div>
      </div>
      <div class="meta">
        <div class="label">Номер</div><strong>${escapeHtml(document.number || source?.number || "")}</strong><br><br>
        <div class="label">Дата</div><strong>${escapeHtml(formatDate(source?.date || document.publishedAt))}</strong>
      </div>
    </header>
    <section class="grid">
      <div><div class="label">Клиент</div><div class="value">${escapeHtml(source?.client || "")}</div><p>${escapeHtml(source?.contact || "")}<br>${escapeHtml(source?.phone || "")}<br>${escapeHtml(source?.email || "")}</p></div>
      <div><div class="label">Обект</div><div class="value">${escapeHtml(source?.object || document.objectName || "")}</div><p>${escapeHtml(source?.address || "")}</p></div>
    </section>
    <table><thead><tr><th>№</th><th>Услуга</th><th>Период</th><th class="right">Стойност</th></tr></thead><tbody>${rows || `<tr><td colspan="4">Няма позиции.</td></tr>`}</tbody></table>
    <section class="totals">
      <div><span>Междинна сума</span><strong>${escapeHtml(formatAmount(totals.subtotal))}</strong></div>
      <div><span>ДДС</span><strong>${escapeHtml(formatAmount(totals.vat))}</strong></div>
      <div><span>Общо</span><strong>${escapeHtml(formatAmount(totals.total))}</strong></div>
    </section>
    <section class="signatures">
      <div><div class="label">Изготвил</div><div class="signature empty">${escapeHtml(source?.preparedBy || "FireControl")}</div></div>
      <div><div class="label">Клиент</div>${signature}</div>
    </section>
  </body>
  </html>`;
}

function openPdfPrintWindow(document: PortalDocument) {
  const printWindow = window.open("", "_blank", "noopener,noreferrer,width=900,height=1100");
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document.write(documentHtml(document));
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 250);
}

function protocolHtml(protocol: PortalProtocol, client: PortalClient) {
  return `<!doctype html>
  <html lang="bg">
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(protocolTitle(protocol))}</title>
    <style>
      @page { size: A4; margin: 16mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #0f172a; font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.5; }
      header { display: grid; grid-template-columns: 1fr 55mm; gap: 12mm; border-bottom: 1px solid #dbe4ef; padding-bottom: 10mm; }
      .brand { font-size: 24pt; font-weight: 900; letter-spacing: -0.5px; }
      .brand span { color: #ea580c; }
      .label { color: #64748b; font-size: 8pt; font-weight: 800; text-transform: uppercase; }
      .meta, .box { border: 1px solid #dbe4ef; border-radius: 8px; padding: 6mm; background: #f8fafc; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10mm; margin-top: 10mm; }
      .value { margin-top: 2mm; font-size: 14pt; font-weight: 900; }
      .section { margin-top: 10mm; }
      p { margin: 2mm 0 0; color: #334155; }
      .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 10mm; margin-top: 18mm; }
      .signature { min-height: 28mm; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 4mm; color: #94a3b8; font-weight: 700; display: flex; align-items: center; justify-content: center; }
    </style>
  </head>
  <body>
    <header>
      <div>
        <div class="brand">FIRE<span>Control</span></div>
        <div class="label">Протокол за пожарна безопасност и сервизно обслужване</div>
      </div>
      <div class="meta">
        <div class="label">Номер</div><strong>${escapeHtml(protocol.number || protocol.id)}</strong><br><br>
        <div class="label">Дата</div><strong>${escapeHtml(formatDate(protocol.date))}</strong>
      </div>
    </header>
    <section class="grid">
      <div class="box"><div class="label">Клиент</div><div class="value">${escapeHtml(client.name || protocol.clientName)}</div><p>${escapeHtml(client.phone)}<br>${escapeHtml(client.email)}</p></div>
      <div class="box"><div class="label">Обект</div><div class="value">${escapeHtml(protocol.objectName || protocol.objectCode)}</div><p>${escapeHtml(protocol.type)}<br>${escapeHtml(protocol.status)}</p></div>
    </section>
    <section class="section box">
      <div class="label">Изпълнител</div>
      <div class="value">${escapeHtml(protocol.technician || "FireControl")}</div>
      <p>Статус: ${escapeHtml(protocolStatus(protocol))}</p>
    </section>
    <section class="signatures">
      <div><div class="label">Изготвил</div><div class="signature">${escapeHtml(protocol.technician || "FireControl")}</div></div>
      <div><div class="label">Клиент</div><div class="signature">Подпис</div></div>
    </section>
  </body>
  </html>`;
}

function openProtocolPrintWindow(protocol: PortalProtocol, client: PortalClient) {
  const printWindow = window.open("", "_blank", "noopener,noreferrer,width=900,height=1100");
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document.write(protocolHtml(protocol, client));
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 250);
}

function DocumentPreview({ document }: { document: PortalDocument }) {
  const source = documentSource(document);
  const lines = documentLines(document);
  const totals = documentTotals(document);
  const terms = document.kind === "contract" ? document.documentData?.contract?.terms || [] : [];

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
      <div className="grid gap-6 md:grid-cols-[1fr_260px]">
        <div>
          <div className="text-3xl font-black tracking-tight">
            FIRE<span className="text-orange-600">Control</span>
          </div>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            {documentKindLabel(document.kind)} за пожарна безопасност и сервизно обслужване.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-black uppercase text-slate-400">Номер</div>
          <div className="mt-1 font-black">{document.number || source?.number}</div>
          <div className="mt-3 text-xs font-black uppercase text-slate-400">Дата</div>
          <div className="mt-1 font-black">{formatDate(source?.date || document.publishedAt)}</div>
          {document.kind === "contract" && document.documentData?.contract?.offerNumber ? (
            <>
              <div className="mt-3 text-xs font-black uppercase text-slate-400">Към оферта</div>
              <div className="mt-1 font-black">{document.documentData.contract.offerNumber}</div>
            </>
          ) : null}
        </div>
      </div>

      <div className="mt-7 grid gap-6 border-t border-slate-200 pt-6 md:grid-cols-2">
        <div>
          <div className="text-xs font-black uppercase text-slate-400">Клиент</div>
          <div className="mt-1 text-lg font-black">{source?.client || document.title}</div>
          <div className="mt-2 text-sm font-semibold leading-6 text-slate-500">
            {[source?.contact, source?.phone, source?.email].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div>
          <div className="text-xs font-black uppercase text-slate-400">Обект</div>
          <div className="mt-1 text-lg font-black">{source?.object || document.objectName || "Обект"}</div>
          <div className="mt-2 text-sm font-semibold leading-6 text-slate-500">{source?.address}</div>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
            <tr>
              <th className="w-10 px-3 py-3">№</th>
              <th className="px-3 py-3">Услуга</th>
              <th className="px-3 py-3">Период</th>
              <th className="px-3 py-3 text-right">Стойност</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.length ? (
              lines.map((line, index) => {
                const quantity = Number(line.quantity) || 1;
                const unitPrice = Number(line.unitPrice) || 0;
                const price = Number(line.price);
                const total = Number.isFinite(price) && price > 0 ? price : quantity * unitPrice;
                return (
                  <tr key={line.id || index}>
                    <td className="px-3 py-4 font-black text-slate-400">{index + 1}</td>
                    <td className="px-3 py-4">
                      <div className="font-black">{line.name || "Услуга"}</div>
                      {line.description ? <div className="mt-2 text-sm font-semibold leading-6 text-slate-500">{line.description}</div> : null}
                    </td>
                    <td className="px-3 py-4 font-bold text-slate-600">{line.period || line.periodicity}</td>
                    <td className="px-3 py-4 text-right font-black">{formatAmount(total)}</td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center font-bold text-slate-400">
                  Няма позиции за визуализация.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-[1fr_320px]">
        <div className="grid gap-4 sm:grid-cols-2">
          {terms.slice(0, 4).map((term) => (
            <div key={term.id || term.title} className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs font-black uppercase text-slate-400">{term.title || "Условие"}</div>
              <div className="mt-2 text-sm font-semibold leading-6 text-slate-600">{term.text}</div>
            </div>
          ))}
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <div className="grid grid-cols-2 border-b border-slate-200">
            <span className="p-4 font-bold text-slate-500">Междинна сума</span>
            <strong className="p-4 text-right">{formatAmount(totals.subtotal)}</strong>
          </div>
          <div className="grid grid-cols-2 border-b border-slate-200">
            <span className="p-4 font-bold text-slate-500">ДДС</span>
            <strong className="p-4 text-right">{formatAmount(totals.vat)}</strong>
          </div>
          <div className="grid grid-cols-2 bg-slate-950 text-white">
            <span className="p-4 font-black">Общо</span>
            <strong className="p-4 text-right">{formatAmount(totals.total)}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProtocolPreview({ protocol, client }: { protocol: PortalProtocol; client: PortalClient }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
      <div className="grid gap-6 md:grid-cols-[1fr_260px]">
        <div>
          <div className="text-3xl font-black tracking-tight">
            FIRE<span className="text-orange-600">Control</span>
          </div>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            Протокол за пожарна безопасност и сервизно обслужване.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-black uppercase text-slate-400">Номер</div>
          <div className="mt-1 font-black">{protocol.number || protocol.id}</div>
          <div className="mt-3 text-xs font-black uppercase text-slate-400">Дата</div>
          <div className="mt-1 font-black">{formatDate(protocol.date)}</div>
        </div>
      </div>

      <div className="mt-7 grid gap-6 border-t border-slate-200 pt-6 md:grid-cols-2">
        <div>
          <div className="text-xs font-black uppercase text-slate-400">Клиент</div>
          <div className="mt-1 text-lg font-black">{client.name || protocol.clientName}</div>
          <div className="mt-2 text-sm font-semibold leading-6 text-slate-500">
            {[client.phone, client.email].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div>
          <div className="text-xs font-black uppercase text-slate-400">Обект</div>
          <div className="mt-1 text-lg font-black">{protocol.objectName || protocol.objectCode || "Обект"}</div>
          <div className="mt-2 text-sm font-semibold leading-6 text-slate-500">
            {protocol.type || "Сервизен протокол"}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-black uppercase text-slate-400">Статус</div>
          <div className="mt-1 font-black">{protocolStatus(protocol)}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-black uppercase text-slate-400">Техник</div>
          <div className="mt-1 font-black">{protocol.technician || "FireControl"}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-black uppercase text-slate-400">Тип</div>
          <div className="mt-1 font-black">{protocol.type || "Протокол"}</div>
        </div>
      </div>
    </div>
  );
}

export default function ClientPortalPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;
  const [data, setData] = useState<PortalData | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [selectedProtocolId, setSelectedProtocolId] = useState("");
  const [signedByName, setSignedByName] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [signState, setSignState] = useState<"idle" | "saving" | "error">("idle");
  const [signError, setSignError] = useState("");

  async function loadPortal() {
    const response = await fetch(`/api/client-portal/${token}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Порталът не може да се зареди.");
    setData(payload);
  }

  useEffect(() => {
    if (!token) return;
    let alive = true;
    async function run() {
      try {
        setLoadState("loading");
        await loadPortal();
        if (alive) setLoadState("ready");
      } catch (error) {
        if (!alive) return;
        setErrorMessage(error instanceof Error ? error.message : "Порталът не може да се зареди.");
        setLoadState("error");
      }
    }
    run();
    return () => {
      alive = false;
    };
  }, [token]);

  const documentsForSignature = useMemo(() => data?.documents.filter((document) => document.requiresSignature) || [], [data]);
  const visibleDocuments = data?.documents || [];
  const libraryItems = useMemo<PortalLibraryItem[]>(() => {
    if (!data) return [];
    return [
      ...data.documents.map((document) => ({
        id: `document-${document.id}`,
        itemType: "document" as const,
        sortDate: document.publishedAt,
        document,
      })),
      ...data.protocols.map((protocol) => ({
        id: `protocol-${protocol.id}`,
        itemType: "protocol" as const,
        sortDate: protocol.date,
        protocol,
      })),
    ].sort((a, b) => {
      const first = new Date(a.sortDate || 0).getTime() || 0;
      const second = new Date(b.sortDate || 0).getTime() || 0;
      return second - first;
    });
  }, [data]);
  const upcomingTasks = useMemo(() => data?.tasks.filter((task) => !taskIsDone(task)) || [], [data]);
  const completedTasks = useMemo(() => data?.tasks.filter(taskIsDone) || [], [data]);
  const selectedDocument = visibleDocuments.find((document) => document.id === selectedDocumentId) || null;
  const selectedProtocol = data?.protocols.find((protocol) => protocol.id === selectedProtocolId) || null;

  function openDocument(document: PortalDocument) {
    setSelectedDocumentId(document.id);
    setSelectedProtocolId("");
    setSignedByName(data?.client.contactPerson || data?.client.name || "");
    setSignatureDataUrl("");
    setSignState("idle");
    setSignError("");
  }

  function openProtocol(protocol: PortalProtocol) {
    setSelectedProtocolId(protocol.id);
    setSelectedDocumentId("");
    setSignState("idle");
    setSignError("");
  }

  function openLibraryItem(item: PortalLibraryItem) {
    if (item.itemType === "protocol") {
      openProtocol(item.protocol);
    } else {
      openDocument(item.document);
    }
  }

  function downloadDocument(document: PortalDocument) {
    openPdfPrintWindow(document);
  }

  function downloadLibraryItem(item: PortalLibraryItem) {
    if (!data) return;
    if (item.itemType === "protocol") {
      openProtocolPrintWindow(item.protocol, data.client);
    } else {
      downloadDocument(item.document);
    }
  }

  async function signDocument() {
    if (!selectedDocument || !token) return;
    try {
      setSignState("saving");
      setSignError("");
      const response = await fetch(`/api/client-portal/${token}/documents/${selectedDocument.id}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedByName, signatureDataUrl }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Документът не беше подписан.");
      await loadPortal();
      setSignState("idle");
    } catch (error) {
      setSignState("error");
      setSignError(error instanceof Error ? error.message : "Документът не беше подписан.");
    }
  }

  if (loadState === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 text-sm font-black text-slate-600 shadow-sm">
          <Loader2 className="animate-spin text-orange-600" size={18} />
          Зареждане на клиентски портал
        </div>
      </main>
    );
  }

  if (loadState === "error" || !data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="max-w-lg rounded-3xl border border-red-100 bg-white p-6 text-center shadow-sm">
          <AlertTriangle className="mx-auto text-red-500" size={32} />
          <h1 className="mt-4 text-xl font-black text-slate-950">Порталът не е достъпен</h1>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">{errorMessage}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f8fb] text-slate-950">
      <header className="border-b border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_48%,#eef4ff_100%)]">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-7 md:flex-row md:items-center md:justify-between">
          <img
            src="/firecontrol-header-logo.png"
            alt="FIREControl"
            className="h-auto w-[230px] max-w-full object-contain object-left sm:w-[280px]"
          />
          <div className="max-w-2xl md:text-right">
            <h1 className="text-3xl font-black leading-tight text-slate-950 sm:text-4xl">
              Клиентски портал
            </h1>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl px-4 py-6">
        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
          <div className="grid gap-0 lg:grid-cols-[1.25fr_0.75fr]">
            <div className="p-6 md:p-8">
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-950 px-3 py-1 text-xs font-black text-white shadow-sm">
                <ShieldCheck size={13} className="mr-1 text-orange-300" />
                Активен портал
              </span>
              <h1 className="mt-4 text-3xl font-black leading-tight md:text-4xl">{data.client.name}</h1>
              <div className="mt-4 flex max-w-3xl flex-wrap gap-2">
                {data.client.contactPerson ? (
                  <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
                    <UserRound size={16} className="text-orange-500" />
                    {data.client.contactPerson}
                  </span>
                ) : null}
                {data.client.phone ? (
                  <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
                    <Phone size={16} className="text-orange-500" />
                    {data.client.phone}
                  </span>
                ) : null}
                {data.client.email ? (
                  <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
                    <Mail size={16} className="text-orange-500" />
                    {data.client.email}
                  </span>
                ) : null}
                {data.client.address ? (
                  <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
                    <MapPin size={16} className="text-orange-500" />
                    {data.client.address}
                  </span>
                ) : null}
              </div>
              <p className="mt-5 max-w-2xl text-sm font-semibold leading-6 text-slate-500">
                Документен център, обслужвани обекти, предстоящи дейности и сервизна история.
              </p>
            </div>
            <div className="border-t border-slate-200 bg-[#f8fafc] p-6 lg:border-l lg:border-t-0">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-black uppercase tracking-wide text-slate-400">Обекти</div>
                <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full border border-slate-200 bg-white px-2 text-xs font-black text-slate-700">
                  {data.locations.length}
                </span>
              </div>
              {data.locations.length ? (
                <div className="mt-3 space-y-2">
                  {data.locations.slice(0, 1).map((location) => (
                    <div key={location.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
                      <div className="flex items-start gap-3">
                        <Building2 className="mt-1 text-orange-600" size={20} />
                        <div>
                          <div className="font-black">{location.name}</div>
                          {location.address ? (
                            <div className="mt-1 text-sm font-semibold leading-5 text-slate-500">{location.address}</div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                  {data.locations.length > 1 ? (
                    <div className="px-1 text-xs font-black uppercase text-slate-400">+ още {data.locations.length - 1} обекта в секцията по-долу</div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-3 text-sm font-semibold leading-6 text-slate-500">
                  Пълният списък с обекти е в секцията по-долу.
                </div>
              )}
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.04)]"><div className="text-xs font-black text-slate-400">Документи</div><div className="text-2xl font-black">{libraryItems.length}</div></div>
                <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.04)]"><div className="text-xs font-black text-slate-400">За подпис</div><div className="text-2xl font-black">{documentsForSignature.length}</div></div>
                <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.04)]"><div className="text-xs font-black text-slate-400">Предстоящи</div><div className="text-2xl font-black">{upcomingTasks.length}</div></div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-[24px] border border-slate-200 bg-white shadow-[0_10px_36px_rgba(15,23,42,0.06)]">
          <div className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-black">Документи</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                Оферти, договори и протоколи, подредени по дата.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="slate">{data.documents.filter((document) => document.kind === "offer").length} оферти</Badge>
              <Badge tone="blue">{data.documents.filter((document) => document.kind === "contract").length} договори</Badge>
              <Badge tone="slate">{data.protocols.length} протоколи</Badge>
              <Badge tone="orange">{documentsForSignature.length} за подпис</Badge>
            </div>
          </div>
          </div>
          <div className="hidden border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs font-black uppercase tracking-wide text-slate-400 md:grid md:grid-cols-[170px_minmax(300px,1.2fr)_220px_170px_170px] md:items-center md:gap-4">
            <div>Тип</div>
            <div>Документ</div>
            <div>Дата и обект</div>
            <div>Статус</div>
            <div className="text-right">Действия</div>
          </div>
          <div className="border-t border-slate-200 md:border-t-0">
            {libraryItems.length ? libraryItems.map((item) => (
              <div key={item.id} className="grid gap-4 border-b border-slate-100 px-5 py-4 transition last:border-b-0 hover:bg-slate-50/80 md:grid-cols-[170px_minmax(300px,1.2fr)_220px_170px_170px] md:items-center md:gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    {item.itemType === "protocol" ? <FileCheck2 size={17} /> : <FileText size={17} />}
                  </div>
                  <span className="text-sm font-black text-slate-700">{libraryItemTypeLabel(item)}</span>
                </div>
                <div className="min-w-0">
                  <h3 className="truncate font-black leading-6 text-slate-950">{libraryItemTitle(item)}</h3>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-bold text-slate-500">
                    {item.itemType === "document" && item.document.number && !documentNumberIsInTitle(item.document) ? <span>№ {item.document.number}</span> : null}
                    {item.itemType === "protocol" && item.protocol.technician ? <span>{item.protocol.technician}</span> : null}
                  </div>
                </div>
                <div className="min-w-0 text-sm font-bold text-slate-600">
                  <div>{formatDate(libraryItemDate(item))}</div>
                  {libraryItemObjectName(item) ? <div className="mt-1 truncate text-xs text-slate-400">{libraryItemObjectName(item)}</div> : null}
                </div>
                <div>
                  <Badge tone={libraryItemTone(item)}>{libraryItemStatus(item)}</Badge>
                </div>
                <div className="flex flex-wrap gap-2 md:justify-end">
                  <button
                    type="button"
                    onClick={() => openLibraryItem(item)}
                    title="Отвори документа"
                    aria-label="Отвори документа"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white transition hover:bg-slate-800"
                  >
                    <ExternalLink size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadLibraryItem(item)}
                    title="Изтегли като PDF"
                    aria-label="Изтегли като PDF"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:border-orange-200 hover:bg-orange-50"
                  >
                    <Download size={16} />
                  </button>
                </div>
              </div>
            )) : (
              <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm font-bold text-slate-400">
                Тук ще се появят оферти, договори и протоколи.
              </div>
            )}
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black">Обекти</h2>
              <Badge>{data.locations.length}</Badge>
            </div>
            <div className="mt-4 space-y-3">
              {data.locations.length ? data.locations.map((location) => (
                <div key={location.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="font-black">{location.name}</div>
                  {location.address ? (
                    <div className="mt-2 flex gap-2 text-sm font-semibold text-slate-500">
                      <MapPin size={16} className="mt-0.5 shrink-0 text-orange-500" />
                      <span>{location.address}</span>
                    </div>
                  ) : null}
                  {location.service ? <div className="mt-2 text-xs font-black uppercase text-slate-400">{location.service}</div> : null}
                </div>
              )) : (
                <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm font-bold text-slate-400">Няма добавени обекти.</div>
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black">График и история</h2>
              <Badge tone="blue">{upcomingTasks.length}</Badge>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <div className="mb-2 text-xs font-black uppercase text-slate-400">Предстоящи</div>
                <div className="space-y-2">
                  {upcomingTasks.slice(0, 8).map((task) => (
                    <div key={task.id} className="rounded-2xl border border-slate-200 p-3">
                      <div className="flex gap-2">
                        <Clock3 className="mt-0.5 shrink-0 text-orange-500" size={17} />
                        <div>
                          <div className="font-black">{task.title}</div>
                          <div className="mt-1 text-xs font-bold text-slate-500">{task.objectName || task.objectCode}</div>
                          <div className="mt-1 text-xs font-black uppercase text-slate-400">{formatDate(task.dueDate)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {!upcomingTasks.length ? <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-center text-sm font-bold text-slate-400">Няма предстоящи дейности.</div> : null}
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs font-black uppercase text-slate-400">Приключени</div>
                <div className="space-y-2">
                  {completedTasks.slice(0, 8).map((task) => (
                    <div key={task.id} className="rounded-2xl border border-slate-200 p-3">
                      <div className="flex gap-2">
                        <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-500" size={17} />
                        <div>
                          <div className="font-black">{task.title}</div>
                          <div className="mt-1 text-xs font-bold text-slate-500">{task.objectName || task.objectCode}</div>
                          <div className="mt-1 text-xs font-black uppercase text-slate-400">{formatDate(task.completedAt)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {!completedTasks.length ? <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-center text-sm font-bold text-slate-400">Няма приключени дейности.</div> : null}
                </div>
              </div>
            </div>
          </div>
        </section>

        <footer className="py-8 text-center text-xs font-bold text-slate-400">FireControl клиентски портал</footer>
      </div>

      {selectedDocument ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 px-4 py-6">
          <div className="mx-auto max-w-5xl rounded-[28px] bg-[#f3f7fb] p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <Badge tone={selectedDocument.status === "signed" ? "green" : "orange"}>{documentStatus(selectedDocument)}</Badge>
                <h2 className="mt-2 text-xl font-black">{selectedDocument.title}</h2>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => downloadDocument(selectedDocument)} className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700">
                  <Download size={18} />
                  PDF
                </button>
                <button type="button" onClick={() => setSelectedDocumentId("")} className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600">
                  <X size={20} />
                </button>
              </div>
            </div>

            <DocumentPreview document={selectedDocument} />

            {selectedDocument.status === "signed" ? (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-1 shrink-0 text-emerald-600" size={22} />
                  <div>
                    <h3 className="text-lg font-black text-emerald-900">Подписан документ</h3>
                    <p className="mt-1 text-sm font-semibold leading-6 text-emerald-800/75">Документът е подписан и е достъпен за преглед и PDF експорт.</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-[1fr_280px]">
                  <div className="rounded-2xl border border-emerald-200 bg-white p-4">
                    <div className="text-xs font-black uppercase text-slate-400">Подписал</div>
                    <div className="mt-1 text-lg font-black text-slate-950">{selectedDocument.signedByName || "Клиент"}</div>
                    <div className="mt-3 text-xs font-black uppercase text-slate-400">Дата</div>
                    <div className="mt-1 text-sm font-bold text-slate-700">{formatDate(selectedDocument.signedAt)}</div>
                  </div>
                  <div className="rounded-2xl border border-dashed border-emerald-200 bg-white p-3">
                    {selectedDocument.signatureDataUrl ? (
                      <img src={selectedDocument.signatureDataUrl} alt="Подпис" className="h-32 w-full object-contain" />
                    ) : (
                      <div className="flex h-32 items-center justify-center text-sm font-bold text-slate-400">Няма изображение на подпис.</div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="text-lg font-black">Онлайн подпис</h3>
                <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
                  С подписването потвърждавате, че сте прегледали документа и го приемате електронно през клиентския портал.
                </p>
                <label className="mt-4 block text-xs font-black uppercase text-slate-400">Име на подписващ</label>
                <input value={signedByName} onChange={(event) => setSignedByName(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold outline-none focus:border-orange-400" />
                <div className="mt-4">
                  <SignaturePad value={signatureDataUrl} onChange={setSignatureDataUrl} />
                </div>
                {signState === "error" ? <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{signError}</div> : null}
                <button type="button" onClick={signDocument} disabled={signState === "saving" || !signedByName.trim() || !signatureDataUrl} className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 text-sm font-black text-white shadow-sm transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-300">
                  {signState === "saving" ? <Loader2 size={18} className="animate-spin" /> : <FileSignature size={18} />}
                  Подпиши документа
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {selectedProtocol ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 px-4 py-6">
          <div className="mx-auto max-w-5xl rounded-[28px] bg-[#f3f7fb] p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <Badge tone="blue">{protocolStatus(selectedProtocol)}</Badge>
                <h2 className="mt-2 text-xl font-black">{protocolTitle(selectedProtocol)}</h2>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => openProtocolPrintWindow(selectedProtocol, data.client)} className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700">
                  <Download size={18} />
                  PDF
                </button>
                <button type="button" onClick={() => setSelectedProtocolId("")} className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600">
                  <X size={20} />
                </button>
              </div>
            </div>

            <ProtocolPreview protocol={selectedProtocol} client={data.client} />
          </div>
        </div>
      ) : null}
    </main>
  );
}
