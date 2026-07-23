"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  Clock3,
  KeyRound,
  Loader2,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
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
    <main className="relative min-h-screen overflow-hidden bg-[#f8fafc] px-5 py-8 text-slate-950 sm:px-8 lg:px-12">
      <div className="absolute inset-y-0 right-0 hidden w-[38vw] rounded-bl-[48%] bg-[linear-gradient(160deg,#ffbd5a_0%,#ff7b1b_46%,#ef3532_100%)] lg:block" />
      <Image
        src="/firecontrol-login-bg-flame.png"
        alt=""
        width={610}
        height={830}
        className="pointer-events-none absolute -left-24 bottom-0 hidden h-auto w-[360px] opacity-[0.16] mix-blend-multiply [mask-image:radial-gradient(ellipse_at_center,black_42%,rgba(0,0,0,0.76)_58%,transparent_78%)] lg:block xl:w-[430px]"
        priority
      />
      <div className="absolute left-[58%] top-8 hidden h-32 w-52 opacity-35 [background-image:radial-gradient(#fdba74_1.4px,transparent_1.4px)] [background-size:16px_16px] lg:block" />

      <div className="relative z-10 mx-auto grid min-h-[calc(100vh-7rem)] w-full max-w-6xl items-center gap-10 pb-6 lg:grid-cols-[1fr_0.92fr]">
        <section className="mx-auto flex w-full max-w-md flex-col items-center text-center lg:items-start lg:text-left">
          <Image
            src="/firecontrol-login-logo.png"
            alt="FIREControl"
            width={591}
            height={180}
            priority
            className="h-auto w-[250px] sm:w-[292px]"
          />

          <p className="mt-6 text-[0.68rem] font-black uppercase tracking-[0.32em] text-orange-600">
            ERP система
          </p>
          <h1 className="mt-5 max-w-lg text-4xl font-black leading-[1.12] text-slate-950 sm:text-5xl">
            Оперативен достъп за екипа.
          </h1>
          <p className="mt-5 max-w-md text-base font-semibold leading-7 text-slate-600">
            Управление на обекти, протоколи, задачи и процеси в един модерен и сигурен работен център.
          </p>

          <div className="mt-10 grid w-full max-w-lg grid-cols-1 gap-5 text-left sm:grid-cols-3">
            <div>
              <ShieldCheck className="text-orange-600" size={24} />
              <p className="mt-4 text-sm font-black text-slate-950">Сигурност</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">Вашите данни са защитени</p>
            </div>
            <div>
              <Clock3 className="text-orange-600" size={24} />
              <p className="mt-4 text-sm font-black text-slate-950">Ефективност</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">Всичко необходимо на едно място</p>
            </div>
            <div>
              <BarChart3 className="text-orange-600" size={24} />
              <p className="mt-4 text-sm font-black text-slate-950">Контрол</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">Пълен поглед върху процесите</p>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[430px]">
          <Card className="w-full rounded-[1.75rem] border-white/90 bg-white/90 px-7 py-9 shadow-[0_28px_80px_rgba(15,23,42,0.15)] backdrop-blur-xl sm:px-9 sm:py-10">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white text-orange-600 shadow-[0_16px_38px_rgba(249,115,22,0.17)] ring-1 ring-orange-100">
              <LockKeyhole size={30} />
            </div>

            <div className="mt-7 text-center">
              <h2 className="text-3xl font-black leading-tight text-slate-950">Вход</h2>
              <p className="mt-3 text-sm font-semibold text-slate-500">
                Въведете служебния си ПИН
              </p>
            </div>

            <div className="mt-8">
              {member?.must_change_pin ? (
                <form className="space-y-5" onSubmit={handleChangePin}>
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                    Създайте нов ПИН
                  </div>
                  <label className="block space-y-2">
                    <span className="sr-only">Нов ПИН</span>
                    <PinInput
                      value={newPin}
                      onChange={(event) => setNewPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
                      required
                      className="h-14 rounded-2xl border-orange-300 text-center text-lg tracking-[0.45em]"
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="sr-only">Повтори ПИН</span>
                    <PinInput
                      value={repeatPin}
                      onChange={(event) => setRepeatPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
                      required
                      className="h-14 rounded-2xl border-orange-300 text-center text-lg tracking-[0.45em]"
                    />
                  </label>
                  <Button type="submit" className="h-[3.25rem] w-full rounded-2xl text-base" disabled={busy}>
                    {busy ? <Loader2 size={18} className="animate-spin" /> : <KeyRound size={18} />}
                    Запази ПИН
                  </Button>
                </form>
              ) : (
                <form className="space-y-5" onSubmit={handleLogin}>
                  <label className="block">
                    <span className="sr-only">ПИН</span>
                    <PinInput
                      value={pin}
                      onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
                      autoFocus
                      required
                      className="h-14 rounded-2xl border-orange-300 text-center text-lg tracking-[0.45em]"
                    />
                  </label>

                  <div className="flex items-center gap-3 text-sm font-semibold text-slate-600">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md border border-orange-500 bg-orange-500 text-white shadow-sm">
                      <Check size={14} strokeWidth={3} />
                    </span>
                    Запомни ме
                  </div>

                  <Button type="submit" className="h-[3.25rem] w-full rounded-2xl text-base" disabled={busy}>
                    {busy ? <Loader2 size={18} className="animate-spin" /> : null}
                    Вход
                    {!busy ? <ArrowRight size={18} /> : null}
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
            </div>
          </Card>
        </section>
      </div>

      <p className="relative z-10 hidden text-center text-sm font-semibold text-slate-500 lg:block">
        © 2026 FireControl. Всички права запазени.
      </p>
    </main>
  );
}
