"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, CheckCircle2, Loader2, Mail, Plus, Printer, Save, Trash2 } from "lucide-react";
import { Button } from "../../../../components/ui/button";
import { Card } from "../../../../components/ui/card";
import { Input } from "../../../../components/ui/input";
import { createSupabaseBrowserClient } from "../../../../lib/supabase/client";

type ContractLine = {
  id: string;
  name: string;
  periodicity: string;
  object: string;
  price: number;
};

type ContractData = {
  opportunityId: string;
  number: string;
  offerNumber: string;
  date: string;
  client: string;
  contact: string;
  phone: string;
  email: string;
  object: string;
  address: string;
  preparedBy: string;
  contractorSignatureUrl: string;
  clientSignatureUrl: string;
  lines: ContractLine[];
  terms: { id: string; title: string; text: string }[];
};

type TeamSession = {
  id?: string;
  name?: string;
  signature_url?: string;
};

const sessionKey = "firecontrol:team-session";

function LabeledField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-black uppercase tracking-wide text-slate-400">{label}</label>
      {children}
    </div>
  );
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function money(value: number) {
  return `${new Intl.NumberFormat("bg-BG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0)} €`;
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

function readPayloadOfferLines(payload: unknown): ContractLine[] {
  if (!isRecord(payload) || !isRecord(payload.offer) || !Array.isArray(payload.offer.lines)) return [];

  return payload.offer.lines.map((line, index) => {
    const item = isRecord(line) ? line : {};
    return {
      id: `offer-line-${index}`,
      name: String(item.name ?? "Услуга"),
      periodicity: "по график",
      object: "",
      price: Number(item.quantity ?? 1) * Number(item.unitPrice ?? 0),
    };
  });
}

function readPayloadOfferNumber(payload: unknown) {
  if (!isRecord(payload) || !isRecord(payload.offer)) return "";
  return String(payload.offer.number ?? "");
}

function readDraftContract(payload: unknown): Partial<ContractData> | null {
  if (!isRecord(payload) || !isRecord(payload.contract)) return null;
  return payload.contract as Partial<ContractData>;
}

function readDraftContractStatus(payload: unknown): "draft" | "accepted" {
  if (!isRecord(payload)) return "draft";
  return payload.status === "accepted" ? "accepted" : "draft";
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
    <div className="mt-4">
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

function serviceLabel(row: { service_category?: string | null; service_name?: string | null }) {
  const category = String(row.service_category ?? "").trim();
  const name = String(row.service_name ?? "").trim();
  return category ? `${category} - ${name}` : name || "Услуга";
}

function nextContractNumber(id: string) {
  return `CTR-${new Date().getFullYear()}-${id.slice(0, 8).toUpperCase()}`;
}

const defaultTerms = [
  {
    id: "subject",
    title: "Предмет на договора",
    text: "Изпълнителят се задължава да извършва услуги, свързани с пожарна безопасност, профилактика, сервиз и документиране за посочения обект.",
  },
  {
    id: "term",
    title: "Срок",
    text: "Договорът се сключва за срок от 12 месеца, считано от датата на подписване, освен ако страните не договорят друго писмено.",
  },
  {
    id: "payment",
    title: "Плащане",
    text: "Плащането се извършва по издадена фактура съгласно договорените цени и срокове.",
  },
  {
    id: "client",
    title: "Задължения на клиента",
    text: "Клиентът осигурява достъп до обекта, лице за контакт и условия за безопасно извършване на дейностите.",
  },
];

export default function ContractEditorPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const opportunityId = params.id;
  const isReadOnly = searchParams.get("mode") === "view";
  const [contract, setContract] = useState<ContractData | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [acceptState, setAcceptState] = useState<"idle" | "saving" | "accepted" | "error">("idle");
  const [contractStatus, setContractStatus] = useState<"draft" | "accepted">("draft");

  useEffect(() => {
    let cancelled = false;

    async function loadContract() {
      setLoadState("loading");
      try {
        const supabase = createSupabaseBrowserClient();
        const session = readSession();
        const [oppResult, offerDocResult, contractDocResult] = await Promise.all([
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
          supabase
            .from("saved_documents")
            .select("payload")
            .eq("id", `contract-${opportunityId}`)
            .eq("kind", "contract")
            .maybeSingle(),
        ]);

        if (oppResult.error || !oppResult.data) throw new Error(oppResult.error?.message || "Липсва сделка.");

        let preparedBy = session?.name || "";
        let signatureUrl = session?.signature_url || "";
        if (session?.id) {
          try {
            const response = await fetch(`/api/team-profile?memberId=${encodeURIComponent(session.id)}`);
            if (response.ok) {
              const profile = await response.json();
              preparedBy = profile.member?.name || preparedBy;
              signatureUrl = profile.member?.signature_url || signatureUrl;
            }
          } catch {
            // Local session fallback is acceptable here.
          }
        }

        const offerLines = readPayloadOfferLines(offerDocResult.data?.payload);
        const offerNumber = readPayloadOfferNumber(offerDocResult.data?.payload);
        const serviceRows = Array.isArray(oppResult.data.sales_opportunity_services)
          ? (oppResult.data.sales_opportunity_services as { service_category?: string | null; service_name?: string | null }[])
          : [];
        const fallbackLines = serviceRows.map((row, index) => ({
          id: `service-${index}`,
          name: serviceLabel(row),
          periodicity: "по график",
          object: String(oppResult.data.object_name ?? ""),
          price: [120, 180, 240, 360][index % 4],
        }));

        const defaultContract: ContractData = {
          opportunityId,
          number: nextContractNumber(opportunityId),
          offerNumber,
          date: dateKey(new Date()),
          client: String(oppResult.data.company_name ?? ""),
          contact: String(oppResult.data.contact_name ?? ""),
          phone: String(oppResult.data.phone ?? ""),
          email: String(oppResult.data.email ?? ""),
          object: String(oppResult.data.object_name ?? ""),
          address: String(oppResult.data.object_address ?? ""),
          preparedBy: preparedBy || "Не е зададен потребител",
          contractorSignatureUrl: signatureUrl,
          clientSignatureUrl: "",
          lines: offerLines.length ? offerLines.map((line) => ({ ...line, object: String(oppResult.data.object_name ?? "") })) : fallbackLines,
          terms: defaultTerms,
        };
        const draft = readDraftContract(contractDocResult.data?.payload);
        const savedStatus = readDraftContractStatus(contractDocResult.data?.payload);
        const isAccepted = savedStatus === "accepted" || String(oppResult.data.status ?? "") === "Потвърден";

        if (cancelled) return;
        setContract({
          ...defaultContract,
          ...draft,
          opportunityId,
          lines: Array.isArray(draft?.lines) && draft.lines.length ? draft.lines as ContractLine[] : defaultContract.lines,
          terms: Array.isArray(draft?.terms) && draft.terms.length ? draft.terms as ContractData["terms"] : defaultContract.terms,
        });
        setContractStatus(isAccepted ? "accepted" : "draft");
        setAcceptState(isAccepted ? "accepted" : "idle");
        setLoadState("ready");
      } catch {
        if (!cancelled) setLoadState("error");
      }
    }

    void loadContract();
    return () => {
      cancelled = true;
    };
  }, [opportunityId]);

  const total = useMemo(() => contract?.lines.reduce((sum, line) => sum + line.price, 0) ?? 0, [contract]);

  function updateContract<K extends keyof ContractData>(key: K, value: ContractData[K]) {
    setContract((current) => current ? { ...current, [key]: value } : current);
  }

  function updateLine(id: string, updates: Partial<ContractLine>) {
    setContract((current) => current ? {
      ...current,
      lines: current.lines.map((line) => line.id === id ? { ...line, ...updates } : line),
    } : current);
  }

  function addLine() {
    setContract((current) => current ? {
      ...current,
      lines: [...current.lines, { id: `line-${Date.now()}`, name: "Нова услуга", periodicity: "по график", object: current.object, price: 0 }],
    } : current);
  }

  function removeLine(id: string) {
    setContract((current) => current ? { ...current, lines: current.lines.filter((line) => line.id !== id) } : current);
  }

  function updateTerm(id: string, text: string) {
    setContract((current) => current ? {
      ...current,
      terms: current.terms.map((term) => term.id === id ? { ...term, text } : term),
    } : current);
  }

  async function persistContract(statusOverride?: "draft" | "accepted") {
    if (!contract) throw new Error("Липсва договор.");
    const nextStatus = statusOverride ?? contractStatus;
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from("saved_documents").upsert(
      {
        id: `contract-${contract.opportunityId}`,
        kind: "contract",
        number: contract.number,
        title: `Договор ${contract.number}`,
        client: contract.client,
        object: contract.object,
        href: `/sales/contract/${contract.opportunityId}`,
        total: money(total),
        payload: { contract, total, status: nextStatus },
        saved_at_ms: Date.now(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
    if (error) throw new Error(error.message);
  }

  async function saveDraft() {
    setSaveState("saving");
    try {
      await persistContract("accepted");
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  async function markAccepted() {
    if (!contract) return;
    setAcceptState("saving");
    try {
      await persistContract();
      const supabase = createSupabaseBrowserClient();
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("sales_opportunities")
        .update({ status: "Потвърден", last_activity_at: now, updated_at: now })
        .eq("id", contract.opportunityId);
      if (error) throw new Error(error.message);
      await supabase.from("sales_activity_logs").insert({
        opportunity_id: contract.opportunityId,
        type: "stage_change",
        title: "Договорът е приет",
        description: `Договор ${contract.number} е маркиран като приет.`,
      });
      setSaveState("saved");
      setContractStatus("accepted");
      setAcceptState("accepted");
    } catch {
      setAcceptState("error");
    }
  }

  if (loadState === "loading") {
    return <main className="flex min-h-screen items-center justify-center bg-slate-100"><Loader2 className="animate-spin text-orange-500" size={28} /></main>;
  }

  if (loadState === "error" || !contract) {
    return (
      <main className="min-h-screen bg-slate-100 p-6">
        <Card className="mx-auto max-w-xl p-6 text-center">
          <h1 className="text-xl font-black text-slate-950">Договорът не може да се зареди.</h1>
          <Link href="/sales" className="mt-4 inline-flex text-sm font-bold text-orange-600">Назад към продажби</Link>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-950 print:bg-white print:p-0">
      <div className="no-print mx-auto mb-4 flex w-full max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href={`/sales/${contract.opportunityId}`} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 shadow-sm">
          <ArrowLeft size={18} />
          Назад
        </Link>
        <div className="flex flex-wrap gap-2">
          {!isReadOnly ? (
            <>
              <Button type="button" variant="outline" onClick={saveDraft} disabled={saveState === "saving"}>
                {saveState === "saving" ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}
                {saveState === "saved" ? "Чернова запазена" : "Запази като чернова"}
              </Button>
              <Button type="button" onClick={markAccepted} disabled={acceptState === "saving"}>
                {acceptState === "saving" ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}
                {acceptState === "accepted" ? "Приет" : "Маркирай като приет"}
              </Button>
              <Button type="button" variant="outline" disabled>
                <Mail size={17} />
                Изпрати по имейл
              </Button>
            </>
          ) : null}
          <Button type="button" onClick={() => window.print()}>
            <Printer size={17} />
            Печат
          </Button>
        </div>
      </div>

      <div className="no-print mx-auto mb-4 w-full max-w-5xl">
        <div className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-black ${
          contractStatus === "accepted"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-orange-200 bg-orange-50 text-orange-700"
        }`}>
          <CheckCircle2 size={17} />
          {contractStatus === "accepted" ? "Договор приет" : "Чернова на договор"}
        </div>
      </div>

      {saveState === "error" || acceptState === "error" ? (
        <div className="no-print mx-auto mb-4 max-w-5xl rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          Договорът не беше запазен.
        </div>
      ) : null}

      <article className={`mx-auto w-full max-w-5xl bg-white p-8 shadow-sm print:max-w-none print:p-0 print:shadow-none ${isReadOnly ? "pointer-events-none" : ""}`}>
        <header className="grid gap-6 border-b-2 border-slate-900 pb-6 md:grid-cols-[1fr_auto]">
          <div>
            <div className="text-3xl font-black tracking-tight">FIRE<span className="text-orange-600 print:text-black">Control</span></div>
            <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-500">Пожарна безопасност, сервиз и абонаментно обслужване</p>
          </div>
          <div className="min-w-72">
            <h1 className="text-3xl font-black uppercase">Договор</h1>
            <div className="mt-4 space-y-2 text-sm">
              <div className="grid grid-cols-[100px_1fr] items-end gap-3">
                <div className="pb-2 font-bold text-slate-500">Номер</div>
                <input
                  value={contract.number}
                  onChange={(event) => updateContract("number", event.target.value)}
                  className="w-full border-0 border-b border-slate-300 bg-transparent px-0 py-2 text-base font-semibold text-slate-900 outline-none transition focus:border-orange-400"
                />
              </div>
              <div className="grid grid-cols-[100px_1fr] items-end gap-3">
                <div className="pb-2 font-bold text-slate-500">Дата</div>
                <input
                  type="date"
                  value={contract.date}
                  onChange={(event) => updateContract("date", event.target.value)}
                  className="w-full border-0 border-b border-slate-300 bg-transparent px-0 py-2 text-base font-semibold text-slate-900 outline-none transition focus:border-orange-400"
                />
              </div>
              <div className="grid grid-cols-[100px_1fr] items-end gap-3">
                <div className="pb-2 font-bold text-slate-500">Към оферта</div>
                <input
                  value={contract.offerNumber}
                  onChange={(event) => updateContract("offerNumber", event.target.value)}
                  placeholder="№ оферта"
                  className="w-full border-0 border-b border-slate-300 bg-transparent px-0 py-2 text-base font-semibold text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-orange-400"
                />
              </div>
            </div>
          </div>
        </header>

        {contract.offerNumber ? (
          <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-bold text-orange-800">
            Договорът е обвързан с оферта № {contract.offerNumber}.
          </div>
        ) : null}

        <div className={`mt-4 rounded-xl border px-4 py-3 text-sm font-bold ${
          contractStatus === "accepted"
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-slate-200 bg-slate-50 text-slate-600"
        }`}>
          Статус: {contractStatus === "accepted" ? "Договор приет" : "Чернова на договор"}
        </div>

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-300 p-4 print:rounded-none">
            <h2 className="mb-3 text-sm font-black uppercase text-slate-500">Клиент</h2>
            <div className="space-y-3">
              <LabeledField label="Фирма">
                <Input value={contract.client} onChange={(event) => updateContract("client", event.target.value)} placeholder="Фирма" />
              </LabeledField>
              <LabeledField label="Лице за контакт">
                <Input value={contract.contact} onChange={(event) => updateContract("contact", event.target.value)} placeholder="Лице за контакт" />
              </LabeledField>
              <LabeledField label="Телефон">
                <Input value={contract.phone} onChange={(event) => updateContract("phone", event.target.value)} placeholder="Телефон" />
              </LabeledField>
              <LabeledField label="Email">
                <Input value={contract.email} onChange={(event) => updateContract("email", event.target.value)} placeholder="Email" />
              </LabeledField>
            </div>
          </div>
          <div className="rounded-xl border border-slate-300 p-4 print:rounded-none">
            <h2 className="mb-3 text-sm font-black uppercase text-slate-500">Обект</h2>
            <div className="space-y-3">
              <LabeledField label="Име на обект">
                <Input value={contract.object} onChange={(event) => updateContract("object", event.target.value)} placeholder="Обект" />
              </LabeledField>
              <LabeledField label="Адрес">
                <Input value={contract.address} onChange={(event) => updateContract("address", event.target.value)} placeholder="Адрес" />
              </LabeledField>
              <LabeledField label="Изготвил">
                <Input value={contract.preparedBy} onChange={(event) => updateContract("preparedBy", event.target.value)} placeholder="Изготвил" />
              </LabeledField>
            </div>
          </div>
        </section>

        <section className="mt-6">
          {!isReadOnly ? (
          <div className="no-print mb-3 flex justify-end">
            <Button type="button" variant="outline" onClick={addLine}>
              <Plus size={17} />
              Добави ред
            </Button>
          </div>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="bg-slate-100">
                  <th className="w-10 border border-slate-300 px-2 py-2">№</th>
                  <th className="border border-slate-300 px-2 py-2 text-left">Услуга</th>
                  <th className="w-36 border border-slate-300 px-2 py-2">Периодичност</th>
                  <th className="border border-slate-300 px-2 py-2 text-left">Обект</th>
                  <th className="w-28 border border-slate-300 px-2 py-2 text-right">Цена</th>
                  {!isReadOnly ? <th className="no-print w-10 border border-slate-300 px-2 py-2" /> : null}
                </tr>
              </thead>
              <tbody>
                {contract.lines.map((line, index) => (
                  <tr key={line.id}>
                    <td className="border border-slate-300 px-2 py-2 text-center font-bold">{index + 1}</td>
                    <td className="border border-slate-300 px-2 py-2"><input value={line.name} onChange={(event) => updateLine(line.id, { name: event.target.value })} className="w-full bg-transparent font-bold outline-none" /></td>
                    <td className="border border-slate-300 px-2 py-2"><input value={line.periodicity} onChange={(event) => updateLine(line.id, { periodicity: event.target.value })} className="w-full bg-transparent text-center outline-none" /></td>
                    <td className="border border-slate-300 px-2 py-2"><input value={line.object} onChange={(event) => updateLine(line.id, { object: event.target.value })} className="w-full bg-transparent outline-none" /></td>
                    <td className="border border-slate-300 px-2 py-2"><input type="number" value={line.price} onChange={(event) => updateLine(line.id, { price: Number(event.target.value) || 0 })} className="w-full bg-transparent text-right outline-none" /></td>
                    {!isReadOnly ? <td className="no-print border border-slate-300 px-2 py-2 text-center"><button type="button" onClick={() => removeLine(line.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button></td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 text-right text-base font-black">Общо: {money(total)}</div>
        </section>

        <section className="mt-6 space-y-4">
          {contract.terms.map((term) => (
            <div key={term.id} className="rounded-xl border border-slate-300 p-4 print:rounded-none">
              <h2 className="mb-2 text-sm font-black uppercase text-slate-500">{term.title}</h2>
              <textarea value={term.text} onChange={(event) => updateTerm(term.id, event.target.value)} rows={3} className="w-full resize-none border-0 bg-transparent text-sm leading-6 outline-none" />
            </div>
          ))}
        </section>

        <footer className="mt-10 grid gap-8 md:grid-cols-2">
          <div>
            <div className="text-sm font-bold">Изпълнител:</div>
            <div className="mt-2 font-black">{contract.preparedBy}</div>
            <div className="mt-4 h-32 rounded-xl border border-dashed border-slate-300 p-3 print:rounded-none">
              {contract.contractorSignatureUrl ? <img src={contract.contractorSignatureUrl} alt="Подпис" className="h-full max-w-full object-contain" /> : null}
            </div>
          </div>
          <div>
            <div className="text-sm font-bold">Клиент:</div>
            <div className="mt-2 font-black">{contract.contact || contract.client || "Без име"}</div>
            <SignaturePad
              value={contract.clientSignatureUrl}
              onChange={(value) => updateContract("clientSignatureUrl", value)}
            />
          </div>
        </footer>
      </article>
    </main>
  );
}
