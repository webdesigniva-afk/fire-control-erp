"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  BarChart3,
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
import { writeTeamSession } from "../../lib/team-session";
import { isValidPin, type TeamMember } from "../../lib/team-members";
import packageInfo from "../../../package.json";

const appVersion = packageInfo.version;

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
  const [showForgotPinInfo, setShowForgotPinInfo] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setErrorMessage("");
    setMessage("");
    setShowForgotPinInfo(false);

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
        writeTeamSession(result.member);
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
      writeTeamSession(result.member);
      window.location.href = "/dashboard";
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Грешка при запис на ПИН.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-[#f8fafc] px-4 py-5 text-slate-950 sm:px-6 sm:py-7 md:px-8 lg:px-12 lg:py-8">
      <div className="absolute inset-x-0 top-0 h-[38svh] rounded-b-[2rem] bg-[linear-gradient(155deg,#fff7ed_0%,#ffedd5_48%,#fb923c_100%)] lg:hidden" />
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

      <div className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 items-center gap-5 pb-4 sm:gap-7 md:max-w-3xl lg:min-h-[calc(100vh-7rem)] lg:max-w-6xl lg:grid-cols-[1fr_0.92fr] lg:gap-10">
        <section className="mx-auto flex w-full max-w-md flex-col items-center text-center md:max-w-2xl lg:items-start lg:text-left">
          <Image
            src="/firecontrol-login-logo.png"
            alt="FIREControl"
            width={591}
            height={180}
            priority
            className="h-auto w-[190px] sm:w-[240px] md:w-[292px]"
          />

          <p className="mt-5 text-[0.62rem] font-black uppercase tracking-[0.28em] text-orange-700 sm:mt-6 sm:text-[0.68rem] sm:tracking-[0.32em]">
            ERP система
          </p>
          <h1 className="mt-3 max-w-lg text-3xl font-black leading-[1.08] text-slate-950 sm:mt-5 sm:text-4xl md:text-5xl">
            Оперативен достъп за екипа.
          </h1>
          <p className="mt-4 max-w-md text-sm font-semibold leading-6 text-slate-600 sm:mt-5 sm:text-base sm:leading-7 md:max-w-xl">
            Вътрешна система за управление на обекти, протоколи, задачи и клиентски процеси.
          </p>

          <div className="mt-5 grid w-full max-w-xl grid-cols-3 gap-2 text-center sm:mt-8 sm:gap-4 md:text-left">
            <div className="min-w-0 rounded-xl border border-white/70 bg-white/55 px-2 py-3 shadow-sm backdrop-blur sm:px-3 md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-0">
              <ShieldCheck className="mx-auto text-orange-600 md:mx-0" size={22} />
              <p className="mt-2 break-words text-[11px] font-black leading-4 text-slate-950 sm:text-sm sm:leading-5 md:mt-4">Достъп</p>
              <p className="mt-1 hidden text-sm font-semibold leading-6 text-slate-500 sm:block">Вход със служебен ПИН</p>
            </div>
            <div className="min-w-0 rounded-xl border border-white/70 bg-white/55 px-2 py-3 shadow-sm backdrop-blur sm:px-3 md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-0">
              <Clock3 className="mx-auto text-orange-600 md:mx-0" size={22} />
              <p className="mt-2 break-words text-[11px] font-black leading-4 text-slate-950 sm:text-sm sm:leading-5 md:mt-4">Работа</p>
              <p className="mt-1 hidden text-sm font-semibold leading-6 text-slate-500 sm:block">Обекти, задачи и протоколи на едно място</p>
            </div>
            <div className="min-w-0 rounded-xl border border-white/70 bg-white/55 px-2 py-3 shadow-sm backdrop-blur sm:px-3 md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-0">
              <BarChart3 className="mx-auto text-orange-600 md:mx-0" size={22} />
              <p className="mt-2 break-words text-[11px] font-black leading-4 text-slate-950 sm:text-sm sm:leading-5 md:mt-4">Проследимост</p>
              <p className="mt-1 hidden text-sm font-semibold leading-6 text-slate-500 sm:block">История на действията и актуални статуси</p>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[430px] md:max-w-[520px] lg:max-w-[430px]">
          <Card className="w-full rounded-[1.35rem] border-white/90 bg-white/95 px-5 py-6 shadow-[0_22px_60px_rgba(15,23,42,0.14)] backdrop-blur-xl sm:rounded-[1.6rem] sm:px-8 sm:py-8 md:px-9 md:py-9 lg:rounded-[1.75rem] lg:py-10">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-orange-600 shadow-[0_14px_34px_rgba(249,115,22,0.16)] ring-1 ring-orange-100 sm:h-20 sm:w-20">
              <LockKeyhole size={26} className="sm:h-[30px] sm:w-[30px]" />
            </div>

            <div className="mt-5 text-center sm:mt-7">
              <h2 className="text-2xl font-black leading-tight text-slate-950 sm:text-3xl">Вход</h2>
              <p className="mt-2 text-sm font-semibold text-slate-500 sm:mt-3">
                Въведете служебния си ПИН
              </p>
            </div>

            <div className="mt-6 sm:mt-8">
              {member?.must_change_pin ? (
                <form className="space-y-4 sm:space-y-5" onSubmit={handleChangePin}>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800 sm:rounded-2xl">
                    Създайте нов ПИН
                  </div>
                  <label className="block space-y-2">
                    <span className="sr-only">Нов ПИН</span>
                    <PinInput
                      value={newPin}
                      onChange={(event) => setNewPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
                      required
                      className="h-12 rounded-xl border-orange-300 text-center text-base tracking-[0.4em] sm:h-14 sm:rounded-2xl sm:text-lg sm:tracking-[0.45em]"
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="sr-only">Повтори ПИН</span>
                    <PinInput
                      value={repeatPin}
                      onChange={(event) => setRepeatPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
                      required
                      className="h-12 rounded-xl border-orange-300 text-center text-base tracking-[0.4em] sm:h-14 sm:rounded-2xl sm:text-lg sm:tracking-[0.45em]"
                    />
                  </label>
                  <Button type="submit" className="h-12 w-full rounded-xl text-base sm:h-[3.25rem] sm:rounded-2xl" disabled={busy}>
                    {busy ? <Loader2 size={18} className="animate-spin" /> : <KeyRound size={18} />}
                    Запази ПИН
                  </Button>
                </form>
              ) : (
                <form className="space-y-4 sm:space-y-5" onSubmit={handleLogin}>
                  <label className="block">
                    <span className="sr-only">ПИН</span>
                    <PinInput
                      value={pin}
                      onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
                      autoFocus
                      required
                      className="h-12 rounded-xl border-orange-300 text-center text-base tracking-[0.4em] sm:h-14 sm:rounded-2xl sm:text-lg sm:tracking-[0.45em]"
                    />
                  </label>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setShowForgotPinInfo((current) => !current)}
                      className="text-sm font-bold text-slate-500 transition hover:text-orange-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100"
                    >
                      Забравен ПИН?
                    </button>
                  </div>

                  <Button type="submit" className="h-12 w-full rounded-xl text-base sm:h-[3.25rem] sm:rounded-2xl" disabled={busy}>
                    {busy ? <Loader2 size={18} className="animate-spin" /> : null}
                    Вход
                    {!busy ? <ArrowRight size={18} /> : null}
                  </Button>
                </form>
              )}

              {showForgotPinInfo && !member?.must_change_pin ? (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold leading-6 text-slate-600 sm:rounded-2xl">
                  Обърнете се към администратор за нулиране на ПИН. След нулиране ще създадете нов ПИН при следващ вход.
                </div>
              ) : null}

              {message ? (
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 sm:rounded-2xl">
                  <CheckCircle2 size={16} />
                  {message}
                </div>
              ) : null}
              {errorMessage ? (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800 sm:rounded-2xl">
                  {errorMessage}
                </div>
              ) : null}
            </div>
          </Card>
        </section>
      </div>

      <p className="relative z-10 px-3 pb-1 text-center text-[11px] font-semibold leading-5 text-slate-500 sm:text-xs lg:text-sm">
        FireControl ERP v{appVersion} · © 2026 FireControl. Всички права запазени.
      </p>
    </main>
  );
}
