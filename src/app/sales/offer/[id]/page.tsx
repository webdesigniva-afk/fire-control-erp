"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, Mail, Plus, Printer, Save, Trash2 } from "lucide-react";
import { Button } from "../../../../components/ui/button";
import { Card } from "../../../../components/ui/card";
import { Input } from "../../../../components/ui/input";
import { createSupabaseBrowserClient } from "../../../../lib/supabase/client";

type OfferLine = {
  id: string;
  name: string;
  description: string;
  period: string;
  quantity: number;
  unitPrice: number;
};

type OfferData = {
  opportunityId: string;
  number: string;
  date: string;
  validUntil: string;
  client: string;
  contact: string;
  phone: string;
  email: string;
  object: string;
  address: string;
  subject: string;
  notes: string;
  preparedBy: string;
  preparedByRole: string;
  signatureUrl: string;
  acceptedSignatureUrl: string;
  lines: OfferLine[];
};

type TeamSession = {
  id?: string;
  name?: string;
  role?: string;
  signature_url?: string;
};

const sessionKey = "firecontrol:team-session";

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDisplayDate(value: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("bg-BG").format(new Date(`${value}T00:00:00`));
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("bg-BG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function money(value: number) {
  return `${formatAmount(value)} €`;
}

function fakePriceFor(index: number) {
  return [45, 65, 120, 180, 240, 360][index % 6];
}

function serviceLabel(row: { service_category?: string | null; service_name?: string | null }) {
  const category = String(row.service_category ?? "").trim();
  const name = String(row.service_name ?? "").trim();
  return category && category !== name ? `${category} - ${name}` : name || category || "Услуга";
}

function defaultPeriodFor(serviceName: string) {
  const normalized = serviceName.toLowerCase();
  if (normalized.includes("годиш") || normalized.includes("периодич")) return "12 месеца";
  if (normalized.includes("абонамент")) return "месечно";
  if (normalized.includes("поддръж") || normalized.includes("обслуж")) return "еднократно";
  if (normalized.includes("презареж")) return "еднократно";
  if (normalized.includes("провер")) return "еднократно";
  return "по заявка";
}

function normalizeLine(line: Partial<OfferLine>, index: number): OfferLine {
  const name = String(line.name || "Услуга");
  return {
    id: String(line.id || `line-${index}-${name}`),
    name,
    description: String(line.description || "Услуга по пожарна безопасност според избрания обхват."),
    period: String(line.period || defaultPeriodFor(name)),
    quantity: Number(line.quantity) || 1,
    unitPrice: Number(line.unitPrice) || 0,
  };
}

function nextOfferNumber(id: string) {
  const year = new Date().getFullYear();
  return `OF-${year}-${id.slice(0, 8).toUpperCase()}`;
}

function readSession(): TeamSession | null {
  try {
    const raw = localStorage.getItem(sessionKey);
    return raw ? (JSON.parse(raw) as TeamSession) : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readDraftOffer(payload: unknown): Partial<OfferData> | null {
  if (!isRecord(payload) || !isRecord(payload.offer)) return null;
  return payload.offer as Partial<OfferData>;
}

function SignaturePad({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);

  function prepareCanvas() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return null;

    context.lineWidth = 2.2;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#0f172a";
    return { canvas, context };
  }

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  useEffect(() => {
    const prepared = prepareCanvas();
    if (!prepared) return;

    prepared.context.clearRect(0, 0, prepared.canvas.width, prepared.canvas.height);
    if (!value) return;

    const image = new Image();
    image.onload = () => {
      prepared.context.clearRect(0, 0, prepared.canvas.width, prepared.canvas.height);
      prepared.context.drawImage(image, 0, 0, prepared.canvas.width, prepared.canvas.height);
    };
    image.src = value;
  }, [value]);

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    const prepared = prepareCanvas();
    const currentPoint = point(event);
    if (!prepared || !currentPoint) return;

    drawingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    prepared.context.beginPath();
    prepared.context.moveTo(currentPoint.x, currentPoint.y);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const prepared = prepareCanvas();
    const currentPoint = point(event);
    if (!prepared || !currentPoint) return;

    prepared.context.lineTo(currentPoint.x, currentPoint.y);
    prepared.context.stroke();
    onChange(prepared.canvas.toDataURL("image/png"));
  }

  function end(event: React.PointerEvent<HTMLCanvasElement>) {
    drawingRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function clear() {
    const prepared = prepareCanvas();
    if (!prepared) return;
    prepared.context.clearRect(0, 0, prepared.canvas.width, prepared.canvas.height);
    onChange("");
  }

  return (
    <div className="mt-3">
      <canvas
        ref={canvasRef}
        width={520}
        height={150}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={() => { drawingRef.current = false; }}
        className="h-32 w-full touch-none rounded-xl border border-dashed border-slate-300 bg-white"
      />
      <div className="no-print mt-3 flex h-10 justify-end">
        <Button type="button" variant="outline" onClick={clear}>
          Изчисти подпис
        </Button>
      </div>
    </div>
  );
}

export default function SalesOfferEditorPage() {
  const params = useParams<{ id: string }>();
  const opportunityId = params.id;
  const [offer, setOffer] = useState<OfferData | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [acceptState, setAcceptState] = useState<"idle" | "saving" | "accepted" | "error">("idle");

  useEffect(() => {
    let cancelled = false;

    async function loadOffer() {
      setLoadState("loading");
      try {
        const supabase = createSupabaseBrowserClient();
        const [{ data, error }, draftResult, session] = await Promise.all([
          supabase
            .from("sales_opportunities")
            .select("*, sales_opportunity_services(service_category, service_name)")
            .eq("id", opportunityId)
            .maybeSingle(),
          supabase
            .from("saved_documents")
            .select("payload")
            .eq("id", `offer-${opportunityId}`)
            .eq("kind", "offer")
            .maybeSingle(),
          Promise.resolve(readSession()),
        ]);

        if (error || !data) throw new Error(error?.message || "Липсва оферта.");

        let preparedBy = session?.name || "";
        let preparedByRole = session?.role || "";
        let signatureUrl = session?.signature_url || "";

        if (session?.id) {
          try {
            const response = await fetch(`/api/team-profile?memberId=${encodeURIComponent(session.id)}`);
            if (response.ok) {
              const profile = await response.json();
              preparedBy = profile.member?.name || preparedBy;
              preparedByRole = profile.member?.role || preparedByRole;
              signatureUrl = profile.member?.signature_url || signatureUrl;
            }
          } catch {
            // The local session is enough for the document header.
          }
        }

        const today = new Date();
        const serviceRows = Array.isArray(data.sales_opportunity_services)
          ? (data.sales_opportunity_services as { service_category?: string | null; service_name?: string | null }[])
          : [];
        const lines = serviceRows.length
          ? serviceRows.map((row, index) => ({
              id: `${index}-${serviceLabel(row)}`,
              name: serviceLabel(row),
              description: "Услуга по пожарна безопасност според избрания обхват.",
              period: defaultPeriodFor(serviceLabel(row)),
              quantity: 1,
              unitPrice: fakePriceFor(index),
            }))
          : [{
              id: "default-service",
              name: "Пожарна безопасност",
              description: "Уточняване на обхват, оглед и последващо обслужване.",
              period: "по заявка",
              quantity: 1,
              unitPrice: 180,
            }];

        if (cancelled) return;
        const defaultOffer: OfferData = {
          opportunityId,
          number: nextOfferNumber(opportunityId),
          date: dateKey(today),
          validUntil: dateKey(addDays(today, 14)),
          client: String(data.company_name ?? ""),
          contact: String(data.contact_name ?? ""),
          phone: String(data.phone ?? ""),
          email: String(data.email ?? ""),
          object: String(data.object_name ?? ""),
          address: String(data.object_address ?? ""),
          subject: "Оферта за услуги, свързани с пожарна безопасност и сервизно обслужване.",
          notes: "Цените са ориентировъчни и могат да бъдат прецизирани след оглед и потвърждение на обхвата.",
          preparedBy: preparedBy || "Не е зададен потребител",
          preparedByRole,
          signatureUrl,
          acceptedSignatureUrl: "",
          lines,
        };
        const draftOffer = readDraftOffer(draftResult.data?.payload);
        setOffer({
          ...defaultOffer,
          ...draftOffer,
          opportunityId,
          acceptedSignatureUrl: draftOffer?.acceptedSignatureUrl || "",
          lines: Array.isArray(draftOffer?.lines) && draftOffer.lines.length
            ? draftOffer.lines.map((line, index) => normalizeLine(line, index))
            : defaultOffer.lines,
        });
        setLoadState("ready");
      } catch {
        if (!cancelled) setLoadState("error");
      }
    }

    void loadOffer();
    return () => {
      cancelled = true;
    };
  }, [opportunityId]);

  const totals = useMemo(() => {
    const subtotal = offer?.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0) ?? 0;
    const vat = subtotal * 0.2;
    return { subtotal, vat, total: subtotal + vat };
  }, [offer]);

  function updateOffer<K extends keyof OfferData>(key: K, value: OfferData[K]) {
    setOffer((current) => current ? { ...current, [key]: value } : current);
  }

  function updateLine(id: string, updates: Partial<OfferLine>) {
    setOffer((current) => current ? {
      ...current,
      lines: current.lines.map((line) => line.id === id ? { ...line, ...updates } : line),
    } : current);
  }

  function addLine() {
    setOffer((current) => current ? {
      ...current,
      lines: [
        ...current.lines,
        {
          id: `line-${Date.now()}`,
          name: "Нова услуга",
          description: "",
          period: "по заявка",
          quantity: 1,
          unitPrice: 0,
        },
      ],
    } : current);
  }

  function removeLine(id: string) {
    setOffer((current) => current ? {
      ...current,
      lines: current.lines.filter((line) => line.id !== id),
    } : current);
  }

  function handleSignatureUpload(file: File | null) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        updateOffer("signatureUrl", reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  async function persistOffer() {
    if (!offer) throw new Error("Липсва оферта.");

    const supabase = createSupabaseBrowserClient();
    const documentId = `offer-${offer.opportunityId}`;
    const { error } = await supabase.from("saved_documents").upsert(
      {
        id: documentId,
        kind: "offer",
        number: offer.number,
        title: `Оферта ${offer.number}`,
        client: offer.client,
        object: offer.object,
        href: `/sales/offer/${offer.opportunityId}`,
        total: money(totals.total),
        payload: { offer, totals },
        saved_at_ms: Date.now(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
    if (error) throw new Error(error.message);

    const { error: opportunityError } = await supabase
      .from("sales_opportunities")
      .update({
        status: "Запазена като чернова",
        updated_at: new Date().toISOString(),
      })
      .eq("id", offer.opportunityId)
      .eq("stage", "offer");
    if (opportunityError) throw new Error(opportunityError.message);
  }

  async function saveOffer() {
    setSaveState("saving");
    try {
      await persistOffer();
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  async function acceptOffer() {
    if (!offer) return;
    setAcceptState("saving");
    setSaveState("idle");
    try {
      await persistOffer();

      const supabase = createSupabaseBrowserClient();
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("sales_opportunities")
        .update({
          stage: "order",
          status: "Потвърден",
          last_activity_at: now,
          updated_at: now,
        })
        .eq("id", offer.opportunityId);
      if (error) throw new Error(error.message);

      await supabase.from("sales_activity_logs").insert({
        opportunity_id: offer.opportunityId,
        type: "stage_change",
        title: "Офертата е приета",
        description: `Оферта ${offer.number} е маркирана като приета и преместена към Поръчки.`,
      });

      setAcceptState("accepted");
      setSaveState("saved");
    } catch {
      setAcceptState("error");
    }
  }

  if (loadState === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <Loader2 className="animate-spin text-orange-500" size={28} />
      </main>
    );
  }

  if (loadState === "error" || !offer) {
    return (
      <main className="min-h-screen bg-slate-100 p-6">
        <Card className="mx-auto max-w-xl p-6 text-center">
          <h1 className="text-xl font-black text-slate-950">Офертата не може да се зареди.</h1>
          <Link href="/sales" className="mt-4 inline-flex text-sm font-bold text-orange-600">
            Назад към продажби
          </Link>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-950 print:bg-white print:p-0">
      <div className="no-print mx-auto mb-4 flex w-full max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href={`/sales/${offer.opportunityId}`} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 shadow-sm">
          <ArrowLeft size={18} />
          Назад
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={saveOffer} disabled={saveState === "saving"}>
            {saveState === "saving" ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}
            {saveState === "saved" ? "Чернова запазена" : "Запази като чернова"}
          </Button>
          <Button type="button" onClick={acceptOffer} disabled={acceptState === "saving"}>
            {acceptState === "saving" ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}
            {acceptState === "accepted" ? "Приета" : "Маркирай като приета"}
          </Button>
          <Button type="button" variant="outline" disabled title="Ще бъде активен на следващ етап">
            <Mail size={17} />
            Изпрати по имейл
          </Button>
          <Button type="button" onClick={() => window.print()}>
            <Printer size={17} />
            Печат
          </Button>
        </div>
      </div>

      {saveState === "error" ? (
        <div className="no-print mx-auto mb-4 max-w-6xl rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          Офертата не беше запазена.
        </div>
      ) : null}
      {acceptState === "error" ? (
        <div className="no-print mx-auto mb-4 max-w-6xl rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          Офертата не беше маркирана като приета.
        </div>
      ) : null}
      {acceptState === "accepted" ? (
        <div className="no-print mx-auto mb-4 max-w-6xl rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
          Офертата е маркирана като приета и сделката е преместена към Поръчки.
        </div>
      ) : null}

      <article className="mx-auto w-full max-w-6xl rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200 print:max-w-none print:rounded-none print:p-0 print:shadow-none print:ring-0">
        <header className="grid gap-8 border-b border-slate-200 pb-8 md:grid-cols-[1fr_auto]">
          <div className="pt-1">
            <div className="text-3xl font-black tracking-tight">
              FIRE<span className="text-orange-600 print:text-black">Control</span>
            </div>
            <p className="mt-2 max-w-xl text-xs font-black uppercase tracking-wide text-slate-500">
              Пожарна безопасност, сервиз и абонаментно обслужване
            </p>
            <div className="mt-6 h-1 w-20 rounded-full bg-gradient-to-r from-red-600 to-orange-400 print:bg-slate-900" />
          </div>
          <div className="min-w-80 rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
            <h1 className="text-3xl font-black uppercase leading-none">Оферта</h1>
            <div className="mt-5 space-y-3 text-sm">
              <label className="grid grid-cols-[92px_1fr] items-center gap-3">
                <span className="text-xs font-black uppercase tracking-wide text-slate-400">Номер</span>
                <Input value={offer.number} onChange={(event) => updateOffer("number", event.target.value)} className="h-10 border-slate-200 bg-white shadow-sm" />
              </label>
              <label className="grid grid-cols-[92px_1fr] items-center gap-3">
                <span className="text-xs font-black uppercase tracking-wide text-slate-400">Дата</span>
                <input type="date" value={offer.date} onChange={(event) => updateOffer("date", event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 shadow-sm outline-none focus:border-orange-300 focus:ring-4 focus:ring-orange-100" />
              </label>
              <label className="grid grid-cols-[92px_1fr] items-center gap-3">
                <span className="text-xs font-black uppercase tracking-wide text-slate-400">Валидна до</span>
                <input type="date" value={offer.validUntil} onChange={(event) => updateOffer("validUntil", event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 shadow-sm outline-none focus:border-orange-300 focus:ring-4 focus:ring-orange-100" />
              </label>
            </div>
          </div>
        </header>

        <section className="mt-7 grid gap-8 border-b border-slate-200 pb-7 md:grid-cols-2">
          <div>
            <h2 className="text-xs font-black uppercase tracking-wide text-slate-400">До</h2>
            <div className="mt-3 space-y-1.5">
              <input value={offer.client} onChange={(event) => updateOffer("client", event.target.value)} placeholder="Фирма" className="w-full bg-transparent text-xl font-black leading-7 text-slate-950 outline-none" />
              <input value={offer.contact} onChange={(event) => updateOffer("contact", event.target.value)} placeholder="Лице за контакт" className="w-full bg-transparent text-sm font-bold leading-6 text-slate-700 outline-none" />
              <input value={offer.phone} onChange={(event) => updateOffer("phone", event.target.value)} placeholder="Телефон" className="w-full bg-transparent text-sm font-semibold leading-6 text-slate-600 outline-none" />
              <input value={offer.email} onChange={(event) => updateOffer("email", event.target.value)} placeholder="Email" className="w-full bg-transparent text-sm font-semibold leading-6 text-slate-600 outline-none" />
            </div>
          </div>
          <div>
            <h2 className="text-xs font-black uppercase tracking-wide text-slate-400">Обект и предмет</h2>
            <div className="mt-3 space-y-1.5">
              <input value={offer.object} onChange={(event) => updateOffer("object", event.target.value)} placeholder="Обект" className="w-full bg-transparent text-xl font-black leading-7 text-slate-950 outline-none" />
              <input value={offer.address} onChange={(event) => updateOffer("address", event.target.value)} placeholder="Адрес" className="w-full bg-transparent text-sm font-bold leading-6 text-slate-700 outline-none" />
              <textarea value={offer.subject} onChange={(event) => updateOffer("subject", event.target.value)} rows={3} className="mt-2 w-full resize-none bg-transparent text-sm font-medium leading-6 text-slate-600 outline-none" />
            </div>
          </div>
        </section>

        <section className="mt-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-black">Офертни позиции</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                Услуги, период на изпълнение и ориентировъчни цени
              </p>
            </div>
            <div className="no-print">
              <Button type="button" variant="outline" onClick={addLine}>
                <Plus size={17} />
                Добави ред
              </Button>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <table className="w-full table-fixed border-collapse text-sm">
              <colgroup>
                <col className="w-[4%]" />
                <col className="w-[31%]" />
                <col className="w-[25%]" />
                <col className="w-[13%]" />
                <col className="w-[7%]" />
                <col className="w-[9%]" />
                <col className="w-[10%]" />
                <col className="no-print w-[4%]" />
              </colgroup>
              <thead>
                <tr className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-3 text-left">№</th>
                  <th className="px-3 py-3 text-left">Услуга</th>
                  <th className="px-3 py-3 text-left">Описание</th>
                  <th className="px-3 py-3 text-left">Период</th>
                  <th className="px-3 py-3 text-center">Бр.</th>
                  <th className="px-3 py-3 text-right">Ед. цена</th>
                  <th className="px-3 py-3 text-right">Общо</th>
                  <th className="no-print px-2 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {offer.lines.map((line, index) => (
                  <tr key={line.id} className="align-top">
                    <td className="px-3 py-4 font-black text-slate-400">{index + 1}</td>
                    <td className="px-3 py-4">
                      <textarea
                        value={line.name}
                        onChange={(event) => updateLine(line.id, { name: event.target.value })}
                        rows={3}
                        className="w-full resize-none overflow-hidden bg-transparent text-sm font-black leading-5 text-slate-950 outline-none"
                      />
                    </td>
                    <td className="px-3 py-4">
                      <textarea
                        value={line.description}
                        onChange={(event) => updateLine(line.id, { description: event.target.value })}
                        rows={3}
                        className="w-full resize-none overflow-hidden bg-transparent text-sm font-medium leading-5 text-slate-600 outline-none"
                      />
                    </td>
                    <td className="px-3 py-4">
                      <input
                        value={line.period}
                        onChange={(event) => updateLine(line.id, { period: event.target.value })}
                        className="w-full bg-transparent text-sm font-bold leading-5 text-slate-700 outline-none"
                      />
                    </td>
                    <td className="px-3 py-4 text-center">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={line.quantity}
                        onChange={(event) => updateLine(line.id, { quantity: Number(event.target.value) || 0 })}
                        className="w-full bg-transparent text-center text-sm font-bold outline-none"
                      />
                    </td>
                    <td className="px-3 py-4">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unitPrice}
                        onChange={(event) => updateLine(line.id, { unitPrice: Number(event.target.value) || 0 })}
                        className="w-full bg-transparent text-right text-sm font-bold outline-none"
                      />
                    </td>
                    <td className="px-3 py-4 text-right font-black text-slate-950">
                      {money(line.quantity * line.unitPrice)}
                    </td>
                    <td className="no-print px-2 py-3 text-center">
                      <button type="button" onClick={() => removeLine(line.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-6 flex justify-end">
          <div className="w-full max-w-sm rounded-xl border border-slate-300 text-sm print:rounded-none">
            <div className="grid grid-cols-2 border-b border-slate-300">
              <div className="border-r border-slate-300 px-3 py-2 font-bold">Междинна сума</div>
              <div className="px-3 py-2 text-right">{money(totals.subtotal)}</div>
            </div>
            <div className="grid grid-cols-2 border-b border-slate-300">
              <div className="border-r border-slate-300 px-3 py-2 font-bold">ДДС 20%</div>
              <div className="px-3 py-2 text-right">{money(totals.vat)}</div>
            </div>
            <div className="grid grid-cols-2 text-base font-black">
              <div className="border-r border-slate-300 px-3 py-2">Общо</div>
              <div className="px-3 py-2 text-right">{money(totals.total)}</div>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-xl border border-slate-300 p-4 print:rounded-none">
          <h2 className="mb-2 text-sm font-black uppercase text-slate-500">Условия</h2>
          <textarea value={offer.notes} onChange={(event) => updateOffer("notes", event.target.value)} rows={3} className="w-full resize-none border-0 bg-transparent text-sm leading-6 outline-none" />
          <p className="mt-2 text-sm font-semibold text-slate-600">
            Валидност: {formatDisplayDate(offer.validUntil)}
          </p>
        </section>

        <footer className="mt-10 grid gap-8 md:grid-cols-2">
          <div>
            <div className="text-sm font-bold">Изготвил:</div>
            <div className="mt-2 font-black">{offer.preparedBy}</div>
            <div className="mt-4 h-32 rounded-xl border border-dashed border-slate-300 p-3 print:rounded-none">
              {offer.signatureUrl ? (
                <img src={offer.signatureUrl} alt="Подпис" className="h-full max-w-full object-contain" />
              ) : (
                <div className="flex h-full items-end text-xs font-semibold text-slate-400">Подпис</div>
              )}
            </div>
            <div className="no-print mt-3 flex h-10 flex-wrap gap-2">
              <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700">
                Зареди подпис
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(event) => handleSignatureUpload(event.target.files?.[0] ?? null)}
                />
              </label>
              {offer.signatureUrl ? (
                <Button type="button" variant="outline" onClick={() => updateOffer("signatureUrl", "")}>
                  Изчисти
                </Button>
              ) : null}
            </div>
          </div>
          <div>
            <div className="text-sm font-bold">Клиент:</div>
            <div className="mt-2 font-black">{offer.contact || offer.client || "Без име"}</div>
            <SignaturePad
              value={offer.acceptedSignatureUrl}
              onChange={(value) => updateOffer("acceptedSignatureUrl", value)}
            />
          </div>
        </footer>
      </article>
    </main>
  );
}
