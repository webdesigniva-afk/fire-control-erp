"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileSignature,
  FileText,
  Loader2,
  MapPin,
  Phone,
  ShieldCheck,
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

type OfferLine = {
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
  lines?: OfferLine[];
};

type ContractPreview = {
  number?: string;
  offerNumber?: string;
  date?: string;
  client?: string;
  contact?: string;
  phone?: string;
  email?: string;
  object?: string;
  address?: string;
  preparedBy?: string;
  lines?: OfferLine[];
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

function documentKindLabel(kind: string) {
  if (kind === "offer") return "Оферта";
  if (kind === "contract") return "Договор";
  if (kind === "protocol") return "Протокол";
  return "Документ";
}

function documentStatusLabel(document: PortalDocument) {
  if (document.status === "signed") {
    if (document.signatureMethod === "portal") return "Подписан онлайн";
    if (document.signatureMethod === "paper") return "Подписан на хартия";
    if (document.signatureMethod === "onsite") return "Подписан на терен";
    return "Подписан";
  }
  if (document.requiresSignature) return "Очаква подпис";
  return "Публикуван";
}

function taskIsDone(task: PortalTask) {
  const status = task.status.toLowerCase();
  return Boolean(task.completedAt) || ["done", "completed", "resolved", "приключена", "готово"].includes(status);
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
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-black ${badgeClass(tone)}`}>
      {children}
    </span>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</div>
          <div className="mt-1 text-2xl font-black text-slate-950">{value}</div>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
          {icon}
        </div>
      </div>
    </div>
  );
}

function SignaturePad({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);

  function prepareCanvas() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return null;

    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    if (canvas.width !== Math.floor(rect.width * ratio) || canvas.height !== Math.floor(rect.height * ratio)) {
      canvas.width = Math.floor(rect.width * ratio);
      canvas.height = Math.floor(rect.height * ratio);
      context.scale(ratio, ratio);
      context.lineCap = "round";
      context.lineJoin = "round";
      context.lineWidth = 2.3;
      context.strokeStyle = "#111827";
      if (value) {
        const image = new Image();
        image.onload = () => context.drawImage(image, 0, 0, rect.width, rect.height);
        image.src = value;
      }
    }

    return { canvas, context, rect };
  }

  useEffect(() => {
    prepareCanvas();
  }, [value]);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const prepared = prepareCanvas();
    if (!prepared) return null;
    return {
      prepared,
      x: event.clientX - prepared.rect.left,
      y: event.clientY - prepared.rect.top,
    };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    const current = point(event);
    if (!current) return;
    drawingRef.current = true;
    current.prepared.canvas.setPointerCapture(event.pointerId);
    current.prepared.context.beginPath();
    current.prepared.context.moveTo(current.x, current.y);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const current = point(event);
    if (!current) return;
    current.prepared.context.lineTo(current.x, current.y);
    current.prepared.context.stroke();
  }

  function finish() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const canvas = canvasRef.current;
    if (canvas) onChange(canvas.toDataURL("image/png"));
  }

  function clear() {
    const prepared = prepareCanvas();
    if (!prepared) return;
    prepared.context.clearRect(0, 0, prepared.rect.width, prepared.rect.height);
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

function DocumentPreview({ document }: { document: PortalDocument }) {
  const offer = document.documentData?.offer;
  const contract = document.documentData?.contract;
  const source = document.kind === "contract" ? contract : offer;
  const totals = document.documentData?.totals;
  const lines = Array.isArray(source?.lines) ? source.lines : [];
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

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="grid gap-4 md:grid-cols-[1fr_auto]">
        <div>
          <div className="text-2xl font-black tracking-tight">
            FIRE<span className="text-orange-600">Control</span>
          </div>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            {documentKindLabel(document.kind)} за пожарна безопасност и сервизно обслужване.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
          <div className="text-xs font-black uppercase text-slate-400">Номер</div>
          <div className="font-black text-slate-950">{document.number || source?.number || document.title}</div>
          <div className="mt-3 text-xs font-black uppercase text-slate-400">Дата</div>
          <div className="font-bold">{formatDate(source?.date || document.publishedAt)}</div>
          {offer?.validUntil ? (
            <>
              <div className="mt-3 text-xs font-black uppercase text-slate-400">Валидна до</div>
              <div className="font-bold">{formatDate(offer.validUntil)}</div>
            </>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-4 border-t border-slate-200 pt-5 md:grid-cols-2">
        <div>
          <div className="text-xs font-black uppercase text-slate-400">Клиент</div>
          <div className="mt-1 text-lg font-black">{source?.client || document.title}</div>
          {source?.contact ? <div className="mt-1 text-sm font-semibold text-slate-600">{source.contact}</div> : null}
          {source?.phone ? <div className="mt-1 text-sm font-semibold text-slate-600">{source.phone}</div> : null}
          {source?.email ? <div className="mt-1 text-sm font-semibold text-slate-600">{source.email}</div> : null}
        </div>
        <div>
          <div className="text-xs font-black uppercase text-slate-400">Обект</div>
          <div className="mt-1 text-lg font-black">{source?.object || document.objectName || "Обект"}</div>
          {source?.address ? <div className="mt-1 text-sm font-semibold text-slate-600">{source.address}</div> : null}
          {document.kind === "contract" && contract?.offerNumber ? (
            <div className="mt-1 text-sm font-semibold text-slate-500">Към оферта № {contract.offerNumber}</div>
          ) : null}
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
            <tr>
              <th className="w-10 px-3 py-3">№</th>
              <th className="px-3 py-3">Услуга</th>
              <th className="px-3 py-3">Период</th>
              <th className="px-3 py-3 text-right">Стойност</th>
            </tr>
          </thead>
          <tbody>
            {lines.length ? lines.map((line, index) => {
              const quantity = Number(line.quantity) || 1;
              const unitPrice = Number(line.unitPrice) || 0;
              return (
                <tr key={line.id || index} className="border-t border-slate-200 align-top">
                  <td className="px-3 py-3 font-black text-slate-400">{index + 1}</td>
                  <td className="px-3 py-3">
                    <div className="font-black">{line.name || "Услуга"}</div>
                    {line.description ? <div className="mt-1 text-sm font-semibold leading-6 text-slate-500">{line.description}</div> : null}
                    {document.kind === "contract" && line.object ? (
                      <div className="mt-1 text-xs font-black uppercase text-slate-400">{line.object}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 font-bold text-slate-600">{line.period || line.periodicity || "-"}</td>
                  <td className="px-3 py-3 text-right font-black">{formatAmount(Number(line.price) || quantity * unitPrice)}</td>
                </tr>
              );
            }) : (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center font-bold text-slate-400">Няма позиции за визуализация.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex justify-end">
        <div className="min-w-64 overflow-hidden rounded-2xl border border-slate-200 text-sm">
          <div className="flex justify-between gap-6 border-b border-slate-200 px-4 py-3">
            <span className="font-bold text-slate-500">Междинна сума</span>
            <span className="font-black">{formatAmount(resolvedSubtotal) || document.total}</span>
          </div>
          <div className="flex justify-between gap-6 border-b border-slate-200 px-4 py-3">
            <span className="font-bold text-slate-500">ДДС</span>
            <span className="font-black">{formatAmount(resolvedVat)}</span>
          </div>
          <div className="flex justify-between gap-6 bg-slate-950 px-4 py-3 text-white">
            <span className="font-black">Общо</span>
            <span className="font-black">{formatAmount(resolvedTotal) || document.total}</span>
          </div>
        </div>
      </div>

      {document.kind === "contract" && contract?.terms?.length ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {contract.terms.map((term, index) => (
            <div key={term.id || index} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-black uppercase text-slate-400">{term.title || "Условие"}</div>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{term.text || ""}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function ClientPortalPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [data, setData] = useState<PortalData | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [signedByName, setSignedByName] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [signState, setSignState] = useState<"idle" | "saving" | "signed" | "error">("idle");
  const [signError, setSignError] = useState("");

  async function loadPortal() {
    setLoadState("loading");
    setErrorMessage("");
    const response = await fetch(`/api/client-portal/${encodeURIComponent(token)}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Порталът не може да се зареди.");
    setData(payload as PortalData);
    setLoadState("ready");
  }

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        await loadPortal();
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Порталът не може да се зареди.");
          setLoadState("error");
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const metrics = useMemo(() => {
    const documentsForSignature = data?.documents.filter((document) => document.requiresSignature && document.status !== "signed").length ?? 0;
    const upcomingTasks = data?.tasks.filter((task) => !taskIsDone(task)).length ?? 0;
    return { documentsForSignature, upcomingTasks };
  }, [data]);

  const selectedDocument = data?.documents.find((document) => document.id === selectedDocumentId) ?? null;
  const pendingDocuments = data?.documents.filter((document) => document.requiresSignature && document.status !== "signed") ?? [];
  const upcomingTasks = data?.tasks.filter((task) => !taskIsDone(task)) ?? [];
  const completedTasks = data?.tasks.filter(taskIsDone) ?? [];

  function openDocument(document: PortalDocument) {
    setSelectedDocumentId(document.id);
    setSignedByName(document.signedByName || data?.client.contactPerson || data?.client.name || "");
    setSignatureDataUrl(document.signatureDataUrl || "");
    setSignState("idle");
    setSignError("");
  }

  async function signDocument() {
    if (!selectedDocument) return;
    setSignState("saving");
    setSignError("");
    try {
      const response = await fetch(
        `/api/client-portal/${encodeURIComponent(token)}/documents/${encodeURIComponent(selectedDocument.id)}/sign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signedByName, signatureDataUrl }),
        }
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Документът не беше подписан.");

      await loadPortal();
      setSignState("signed");
      setSelectedDocumentId("");
      setSignatureDataUrl("");
    } catch (error) {
      setSignState("error");
      setSignError(error instanceof Error ? error.message : "Документът не беше подписан.");
    }
  }

  if (loadState === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-black text-slate-700 shadow-sm">
          <Loader2 className="animate-spin text-orange-600" size={20} />
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
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-2xl font-black tracking-tight">
              FIRE<span className="text-orange-600">Control</span>
            </div>
            <p className="mt-1 text-xs font-black uppercase tracking-wide text-slate-400">Клиентски портал</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <div className="font-black text-slate-950">{data.client.name}</div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-500">
              {data.client.contactPerson ? <span>{data.client.contactPerson}</span> : null}
              {data.client.phone ? <span>{data.client.phone}</span> : null}
              {data.client.email ? <span>{data.client.email}</span> : null}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl px-4 py-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <Badge tone="green">
                <ShieldCheck size={13} className="mr-1" />
                Активен портал
              </Badge>
              <h1 className="mt-4 text-3xl font-black leading-tight md:text-4xl">{data.client.name}</h1>
              <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-500">
                Тук са публикуваните документи, протоколи, обекти и предстоящи дейности, свързани с обслужването по пожарна безопасност.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[520px]">
              <StatCard label="Обекти" value={data.locations.length} icon={<Building2 size={20} />} />
              <StatCard label="За подпис" value={metrics.documentsForSignature} icon={<FileSignature size={20} />} />
              <StatCard label="Предстоящи" value={metrics.upcomingTasks} icon={<CalendarClock size={20} />} />
            </div>
          </div>
        </section>

        {pendingDocuments.length ? (
          <section className="mt-6 rounded-3xl border border-orange-200 bg-orange-50 p-5">
            <h2 className="text-lg font-black text-orange-900">Документи, очакващи подпис</h2>
            <p className="mt-1 text-sm font-semibold text-orange-800/70">Отворете документа, прегледайте го и подпишете онлайн.</p>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {pendingDocuments.map((document) => (
                <div key={document.id} className="rounded-2xl border border-orange-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Badge tone="orange">{documentStatusLabel(document)}</Badge>
                      <h3 className="mt-3 text-lg font-black">{document.title}</h3>
                      <p className="mt-1 text-sm font-semibold text-slate-500">
                        {documentKindLabel(document.kind)} {document.number ? `№ ${document.number}` : ""}
                      </p>
                    </div>
                    <FileSignature className="text-orange-500" size={24} />
                  </div>
                  <button
                    type="button"
                    onClick={() => openDocument(document)}
                    className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl bg-orange-600 px-4 text-sm font-black text-white shadow-sm transition hover:bg-orange-700"
                  >
                    Отвори и подпиши
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-6 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-black">Обекти</h2>
              <Badge>{data.locations.length}</Badge>
            </div>
            <div className="mt-4 space-y-3">
              {data.locations.length ? data.locations.map((location) => (
                <div key={location.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-black">{location.name}</h3>
                      {location.address ? (
                        <div className="mt-2 flex gap-2 text-sm font-semibold text-slate-500">
                          <MapPin size={16} className="mt-0.5 shrink-0 text-orange-500" />
                          <span>{location.address}</span>
                        </div>
                      ) : null}
                    </div>
                    <Badge tone={location.status === "изряден" ? "green" : "orange"}>{location.status || "Статус"}</Badge>
                  </div>
                </div>
              )) : (
                <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm font-bold text-slate-400">
                  Няма добавени обекти.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-black">Документи</h2>
              <Badge>{data.documents.length}</Badge>
            </div>
            <div className="mt-4 space-y-3">
              {data.documents.length ? data.documents.map((document) => (
                <div
                  key={document.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openDocument(document)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") openDocument(document);
                  }}
                  className="cursor-pointer rounded-2xl border border-slate-200 p-4 transition hover:border-orange-200 hover:bg-orange-50/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Badge tone={document.status === "signed" ? "green" : document.requiresSignature ? "orange" : "blue"}>
                        {documentStatusLabel(document)}
                      </Badge>
                      <h3 className="mt-3 font-black">{document.title}</h3>
                      <p className="mt-1 text-sm font-semibold text-slate-500">
                        {documentKindLabel(document.kind)} {document.total ? `- ${document.total}` : ""}
                      </p>
                    </div>
                    <FileText className="text-slate-400" size={22} />
                  </div>
                  {document.status !== "signed" && document.requiresSignature ? (
                    <button type="button" onClick={() => openDocument(document)} className="mt-3 text-sm font-black text-orange-600">
                      Отвори за подпис
                    </button>
                  ) : null}
                </div>
              )) : (
                <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm font-bold text-slate-400">
                  Няма публикувани документи.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-black">Предстоящи дейности</h2>
              <Badge tone="blue">{upcomingTasks.length}</Badge>
            </div>
            <div className="mt-4 space-y-3">
              {upcomingTasks.length ? upcomingTasks.map((task) => (
                <div key={task.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex gap-3">
                    <Clock3 className="mt-0.5 shrink-0 text-orange-500" size={20} />
                    <div>
                      <h3 className="font-black">{task.title}</h3>
                      <p className="mt-1 text-sm font-semibold text-slate-500">{task.objectName || task.objectCode}</p>
                      <p className="mt-2 text-xs font-black uppercase tracking-wide text-slate-400">{formatDate(task.dueDate)}</p>
                    </div>
                  </div>
                </div>
              )) : (
                <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm font-bold text-slate-400">
                  Няма предстоящи дейности.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-black">Протоколи и история</h2>
              <Badge>{data.protocols.length}</Badge>
            </div>
            <div className="mt-4 space-y-3">
              {data.protocols.length ? data.protocols.map((protocol) => (
                <div key={protocol.id} className="rounded-2xl border border-slate-200 p-4">
                  <h3 className="font-black">{protocol.number || "Протокол"}</h3>
                  <p className="mt-1 text-sm font-semibold text-slate-500">{protocol.objectName}</p>
                  <p className="mt-2 text-xs font-black uppercase tracking-wide text-slate-400">
                    {formatDate(protocol.date)} {protocol.technician ? `- ${protocol.technician}` : ""}
                  </p>
                </div>
              )) : completedTasks.length ? completedTasks.map((task) => (
                <div key={task.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex gap-3">
                    <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-500" size={20} />
                    <div>
                      <h3 className="font-black">{task.title}</h3>
                      <p className="mt-1 text-sm font-semibold text-slate-500">{task.objectName || task.objectCode}</p>
                      <p className="mt-2 text-xs font-black uppercase tracking-wide text-slate-400">{formatDate(task.completedAt)}</p>
                    </div>
                  </div>
                </div>
              )) : (
                <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm font-bold text-slate-400">
                  Няма протоколи или приключена история.
                </div>
              )}
            </div>
          </div>
        </section>

        <footer className="py-8 text-center text-xs font-bold text-slate-400">
          FireControl клиентски портал
        </footer>
      </div>

      {selectedDocument ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 px-4 py-6">
          <div className="mx-auto max-w-5xl rounded-3xl bg-slate-100 p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <Badge tone="orange">{documentStatusLabel(selectedDocument)}</Badge>
                <h2 className="mt-2 text-xl font-black">{selectedDocument.title}</h2>
              </div>
              <button type="button" onClick={() => setSelectedDocumentId("")} className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600">
                <X size={20} />
              </button>
            </div>

            <DocumentPreview document={selectedDocument} />

            {selectedDocument.status === "signed" ? (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-1 shrink-0 text-emerald-600" size={22} />
                  <div>
                    <h3 className="text-lg font-black text-emerald-900">Подписан документ</h3>
                    <p className="mt-1 text-sm font-semibold leading-6 text-emerald-800/75">
                      Документът е подписан онлайн през клиентския портал.
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-[1fr_280px]">
                  <div className="rounded-2xl border border-emerald-200 bg-white p-4">
                    <div className="text-xs font-black uppercase text-slate-400">Подписал</div>
                    <div className="mt-1 text-lg font-black text-slate-950">{selectedDocument.signedByName || "Клиент"}</div>
                    <div className="mt-3 text-xs font-black uppercase text-slate-400">Дата на подпис</div>
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
              <input
                value={signedByName}
                onChange={(event) => setSignedByName(event.target.value)}
                className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold outline-none focus:border-orange-400"
              />
              <div className="mt-4">
                <SignaturePad value={signatureDataUrl} onChange={setSignatureDataUrl} />
              </div>
              {signState === "error" ? (
                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{signError}</div>
              ) : null}
              <button
                type="button"
                onClick={signDocument}
                disabled={signState === "saving" || !signedByName.trim() || !signatureDataUrl}
                className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 text-sm font-black text-white shadow-sm transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {signState === "saving" ? <Loader2 size={18} className="animate-spin" /> : <FileSignature size={18} />}
                Подпиши документа
              </button>
            </div>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
