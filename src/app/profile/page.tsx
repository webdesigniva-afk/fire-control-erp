"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type PointerEvent,
} from "react";
import {
  Camera,
  CheckCircle2,
  Eraser,
  KeyRound,
  Loader2,
  Lock,
  PenLine,
  Save,
  UserRound,
} from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { PinInput } from "../../components/ui/pin-input";
import { getTeamMemberInitials, isValidPin, type TeamMember } from "../../lib/team-members";

const sessionKey = "firecontrol:team-session";

type Notice = { type: "success" | "error"; text: string } | null;

type ProfileActivity = {
  lastProtocol: string;
  assignedVisits: number | null;
  activeProblems: number | null;
};

type ProfileResponse = {
  member?: TeamMember;
  activity?: ProfileActivity;
  error?: string;
};

const emptyActivity: ProfileActivity = {
  lastProtocol: "",
  assignedVisits: null,
  activeProblems: null,
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("bg-BG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function normalizePin(value: string) {
  return value.replace(/\D/g, "").slice(0, 4);
}

function saveSession(member: TeamMember) {
  localStorage.setItem(sessionKey, JSON.stringify(member));
  window.dispatchEvent(new Event("firecontrol:team-session-updated"));
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Invalid image data"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Image read failed"));
    reader.readAsDataURL(file);
  });
}

function LockedField({ label, value }: { label: string; value: string }) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-black uppercase text-slate-400">{label}</span>
      <div className="relative">
        <Input value={value} readOnly className="bg-slate-50 pr-11" />
        <Lock
          size={16}
          className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-300"
          aria-hidden="true"
        />
      </div>
    </label>
  );
}

function ActivityItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-xs font-black uppercase text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-black text-slate-800">{value}</div>
    </div>
  );
}

function SignatureCanvas({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);

  function prepareContext() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return null;

    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 3;
    context.strokeStyle = "#0f172a";

    return { canvas, context };
  }

  function pointFromEvent(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function startDrawing(event: PointerEvent<HTMLCanvasElement>) {
    const prepared = prepareContext();
    const point = pointFromEvent(event);
    if (!prepared || !point) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    isDrawingRef.current = true;
    prepared.context.beginPath();
    prepared.context.moveTo(point.x, point.y);
  }

  function draw(event: PointerEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current) return;

    const prepared = prepareContext();
    const point = pointFromEvent(event);
    if (!prepared || !point) return;

    prepared.context.lineTo(point.x, point.y);
    prepared.context.stroke();
  }

  function stopDrawing(event: PointerEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current) return;

    isDrawingRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
    onChange(event.currentTarget.toDataURL("image/png"));
  }

  function clearCanvas() {
    const prepared = prepareContext();
    if (!prepared) return;

    prepared.context.clearRect(0, 0, prepared.canvas.width, prepared.canvas.height);
    onChange("");
  }

  return (
    <div className="space-y-3">
      <canvas
        ref={canvasRef}
        width={720}
        height={220}
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={stopDrawing}
        onPointerCancel={stopDrawing}
        className="h-44 w-full touch-none rounded-xl border border-slate-200 bg-white shadow-inner"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-bold text-slate-500">
          {value ? "Новият подпис е готов за запис." : "Подпишете се в полето."}
        </span>
        <Button type="button" variant="outline" onClick={clearCanvas}>
          <Eraser size={16} />
          Изчисти
        </Button>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const [member, setMember] = useState<TeamMember | null>(null);
  const [activity, setActivity] = useState<ProfileActivity>(emptyActivity);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [repeatPin, setRepeatPin] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPin, setSavingPin] = useState(false);
  const [savingSignature, setSavingSignature] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const rawProfile = localStorage.getItem(sessionKey);
    if (!rawProfile) {
      window.location.href = "/login";
      return;
    }

    async function loadProfile() {
      try {
        const storedMember = JSON.parse(rawProfile as string) as TeamMember;
        const response = await fetch(`/api/team-profile?memberId=${encodeURIComponent(storedMember.id)}`);
        const result = (await response.json()) as ProfileResponse;

        if (!response.ok || !result.member) {
          throw new Error(result.error || "Грешка при зареждане на профила.");
        }

        setMember(result.member);
        setPhone(result.member.phone || "");
        setEmail(result.member.email || "");
        setActivity(result.activity ?? emptyActivity);
        saveSession(result.member);
      } catch (error) {
        setNotice({
          type: "error",
          text: error instanceof Error ? error.message : "Грешка при зареждане на профила.",
        });
      } finally {
        setLoading(false);
      }
    }

    void loadProfile();
  }, []);

  async function handleProfileSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!member) return;

    setSavingProfile(true);
    setNotice(null);

    try {
      const response = await fetch("/api/team-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: member.id, phone, email }),
      });
      const result = (await response.json()) as ProfileResponse;

      if (!response.ok || !result.member) {
        throw new Error(result.error || "Грешка при запис на профила.");
      }

      setMember(result.member);
      saveSession(result.member);
      setNotice({ type: "success", text: "Профилът е обновен." });
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Грешка при запис на профила.",
      });
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    if (!member) return;

    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setSavingAvatar(true);
    setNotice(null);

    try {
      const avatarDataUrl = await fileToDataUrl(file);
      const response = await fetch("/api/team-profile/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: member.id, avatarDataUrl }),
      });
      const result = (await response.json()) as ProfileResponse;

      if (!response.ok || !result.member) {
        throw new Error(result.error || "Грешка при запис на снимка.");
      }

      setMember(result.member);
      saveSession(result.member);
      setNotice({ type: "success", text: "Снимката е обновена." });
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Грешка при запис на снимка.",
      });
    } finally {
      setSavingAvatar(false);
    }
  }

  async function handlePinSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!member) return;

    setNotice(null);

    if (!isValidPin(newPin)) {
      setNotice({ type: "error", text: "ПИН кодът трябва да бъде 4 цифри." });
      return;
    }

    if (newPin !== repeatPin) {
      setNotice({ type: "error", text: "Новият ПИН не съвпада." });
      return;
    }

    setSavingPin(true);

    try {
      const response = await fetch("/api/team-profile/change-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: member.id, currentPin, newPin }),
      });
      const result = (await response.json()) as ProfileResponse;

      if (!response.ok || !result.member) {
        throw new Error(result.error || "Грешка при запис на ПИН.");
      }

      setMember(result.member);
      saveSession(result.member);
      setCurrentPin("");
      setNewPin("");
      setRepeatPin("");
      setNotice({ type: "success", text: "ПИН кодът е обновен." });
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Грешка при запис на ПИН.",
      });
    } finally {
      setSavingPin(false);
    }
  }

  async function handleSignatureSave() {
    if (!member || !signatureDataUrl) return;

    setSavingSignature(true);
    setNotice(null);

    try {
      const response = await fetch("/api/team-profile/signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: member.id, signatureDataUrl }),
      });
      const result = (await response.json()) as ProfileResponse;

      if (!response.ok || !result.member) {
        throw new Error(result.error || "Грешка при запис на подпис.");
      }

      setMember(result.member);
      saveSession(result.member);
      setSignatureDataUrl("");
      setNotice({ type: "success", text: "Подписът е запазен." });
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Грешка при запис на подпис.",
      });
    } finally {
      setSavingSignature(false);
    }
  }

  return (
    <AppShell
      title="Моят профил"
      description="Лични данни, ПИН код и подпис за протоколи"
      showSearch={false}
    >
      <div className="space-y-5">
        {notice ? (
          <div
            className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold ${
              notice.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {notice.type === "success" ? <CheckCircle2 size={17} /> : null}
            {notice.text}
          </div>
        ) : null}

        {loading ? (
          <Card className="p-5">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-500">
              <Loader2 size={17} className="animate-spin" />
              Зареждане...
            </div>
          </Card>
        ) : null}

        {member ? (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-5">
              <Card className="p-5">
                <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                      <UserRound size={20} />
                    </div>
                    <h2 className="text-lg font-black text-slate-950">Основни данни</h2>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-orange-50 text-lg font-black text-orange-700 shadow-sm">
                      {member.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={member.photo_url} alt={member.name} className="h-full w-full object-cover" />
                      ) : (
                        getTeamMemberInitials(member.name)
                      )}
                    </div>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={handleAvatarChange}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={savingAvatar}
                    >
                      {savingAvatar ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                      Смени снимка
                    </Button>
                  </div>
                </div>

                <form className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={handleProfileSave}>
                  <LockedField label="Име" value={member.name} />
                  <LockedField label="Код служител" value={member.employee_code} />
                  <LockedField label="Роля" value={member.role} />
                  <LockedField label="Последен вход" value={formatDateTime(member.last_login_at)} />
                  <label className="space-y-2">
                    <span className="text-xs font-black uppercase text-slate-400">Телефон</span>
                    <Input value={phone} onChange={(event) => setPhone(event.target.value)} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-xs font-black uppercase text-slate-400">Email</span>
                    <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
                  </label>
                  <div className="md:col-span-2">
                    <Button type="submit" disabled={savingProfile}>
                      {savingProfile ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                      Запази данни
                    </Button>
                  </div>
                </form>
              </Card>

              <Card className="p-5">
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                    <KeyRound size={20} />
                  </div>
                  <h2 className="text-lg font-black text-slate-950">Смяна на ПИН</h2>
                </div>

                <form className="grid grid-cols-1 gap-4 md:grid-cols-3" onSubmit={handlePinSave}>
                  <label className="space-y-2">
                    <span className="text-xs font-black uppercase text-slate-400">Текущ ПИН</span>
                    <PinInput
                      value={currentPin}
                      onChange={(event) => setCurrentPin(normalizePin(event.target.value))}
                      required
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-xs font-black uppercase text-slate-400">Нов ПИН</span>
                    <PinInput
                      value={newPin}
                      onChange={(event) => setNewPin(normalizePin(event.target.value))}
                      required
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-xs font-black uppercase text-slate-400">Повтори нов ПИН</span>
                    <PinInput
                      value={repeatPin}
                      onChange={(event) => setRepeatPin(normalizePin(event.target.value))}
                      required
                    />
                  </label>
                  <div className="md:col-span-3">
                    <Button type="submit" disabled={savingPin}>
                      {savingPin ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
                      Обнови ПИН
                    </Button>
                  </div>
                </form>
              </Card>
            </div>

            <div className="space-y-5">
              <Card className="p-5">
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                    <PenLine size={20} />
                  </div>
                  <h2 className="text-lg font-black text-slate-950">Подпис</h2>
                </div>

                {member.signature_url ? (
                  <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-2 text-xs font-black uppercase text-slate-400">Запазен подпис</div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={member.signature_url} alt="Запазен подпис" className="max-h-28 rounded-lg bg-white object-contain" />
                    <div className="mt-2 text-xs font-bold text-slate-400">
                      Обновен: {formatDateTime(member.signature_updated_at)}
                    </div>
                  </div>
                ) : (
                  <div className="mb-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500">
                    Няма запазен подпис.
                  </div>
                )}

                <SignatureCanvas value={signatureDataUrl} onChange={setSignatureDataUrl} />
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button type="button" onClick={handleSignatureSave} disabled={!signatureDataUrl || savingSignature}>
                    {savingSignature ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Запази подпис
                  </Button>
                </div>
              </Card>

              <Card className="p-5">
                <h2 className="mb-5 text-lg font-black text-slate-950">Активност</h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <ActivityItem label="Последен вход" value={formatDateTime(member.last_login_at)} />
                  <ActivityItem label="Последен създаден протокол" value={activity.lastProtocol || "—"} />
                  <ActivityItem
                    label="Назначени посещения"
                    value={activity.assignedVisits === null ? "—" : String(activity.assignedVisits)}
                  />
                  <ActivityItem
                    label="Активни проблеми"
                    value={activity.activeProblems === null ? "—" : String(activity.activeProblems)}
                  />
                </div>
              </Card>
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
