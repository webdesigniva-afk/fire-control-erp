"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, KeyRound, Loader2, LogIn, ShieldCheck } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { PinInput } from "../../components/ui/pin-input";
import { isValidPin, type TeamMember } from "../../lib/team-members";

const sessionKey = "firecontrol:team-session";

type LoginResult = {
  member?: TeamMember;
  error?: string;
};

export default function LoginPage() {
  const [pin, setPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [repeatPin, setRepeatPin] = useState("");
  const [member, setMember] = useState<TeamMember | null>(null);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setErrorMessage("");
    setMessage("");

    try {
      const response = await fetch("/api/team-auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const result = (await response.json()) as LoginResult;

      if (!response.ok || !result.member) {
        throw new Error(result.error || "Грешка при вход.");
      }

      setMember(result.member);
      if (!result.member.must_change_pin) {
        localStorage.setItem(sessionKey, JSON.stringify(result.member));
        window.location.href = "/dashboard";
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Грешка при вход.");
    } finally {
      setBusy(false);
    }
  }

  async function handleChangePin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!member) return;
    setBusy(true);
    setErrorMessage("");
    setMessage("");

    try {
      if (!isValidPin(newPin) || newPin !== repeatPin) {
        throw new Error("Новият ПИН трябва да е 4 цифри и да съвпада.");
      }

      const response = await fetch("/api/team-auth/change-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: member.id, pin: newPin }),
      });
      const result = (await response.json()) as LoginResult;

      if (!response.ok || !result.member) {
        throw new Error(result.error || "Грешка при запис на ПИН.");
      }

      setMember(result.member);
      localStorage.setItem(sessionKey, JSON.stringify(result.member));
      window.location.href = "/dashboard";
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Грешка при запис на ПИН.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.12),transparent_32rem),linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)] px-4 py-10 text-slate-900">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-md items-center">
        <Card className="w-full p-6 sm:p-7">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-orange-200 bg-orange-50 text-orange-600">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-950">Вход</h1>
              <p className="text-sm font-semibold text-slate-500">Въведете служебния си ПИН</p>
            </div>
          </div>

          {member?.must_change_pin ? (
            <form className="space-y-4" onSubmit={handleChangePin}>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                Създайте нов ПИН
              </div>
              <label className="block space-y-2">
                <span className="text-xs font-black uppercase text-slate-400">Нов ПИН</span>
                <PinInput
                  value={newPin}
                  onChange={(event) => setNewPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
                  required
                />
              </label>
              <label className="block space-y-2">
                <span className="text-xs font-black uppercase text-slate-400">Повтори ПИН</span>
                <PinInput
                  value={repeatPin}
                  onChange={(event) => setRepeatPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
                  required
                />
              </label>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
                Запази ПИН
              </Button>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={handleLogin}>
              <label className="block space-y-2">
                <span className="text-xs font-black uppercase text-slate-400">ПИН</span>
                <PinInput
                  value={pin}
                  onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
                  autoFocus
                  required
                />
              </label>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
                Вход
              </Button>
            </form>
          )}

          {message ? (
            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
              <CheckCircle2 size={16} />
              {message}
            </div>
          ) : null}
          {errorMessage ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">
              {errorMessage}
            </div>
          ) : null}
        </Card>
      </div>
    </main>
  );
}
