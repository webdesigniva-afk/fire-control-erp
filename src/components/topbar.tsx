"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Bell, LogOut, Search, UserRound } from "lucide-react";
import { getTeamMemberInitials, type TeamMember } from "../lib/team-members";

type TopbarProps = {
  title: string;
  description: string;
  headerAction?: ReactNode;
  showSearch?: boolean;
};

export function Topbar({
  title,
  description,
  headerAction,
  showSearch = true,
}: TopbarProps) {
  const [profile, setProfile] = useState<TeamMember | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    function refreshProfile() {
      const rawProfile = localStorage.getItem("firecontrol:team-session");
      if (!rawProfile) {
        setProfile(null);
        return;
      }

      try {
        setProfile(JSON.parse(rawProfile) as TeamMember);
      } catch {
        localStorage.removeItem("firecontrol:team-session");
        setProfile(null);
      }
    }

    refreshProfile();
    window.addEventListener("firecontrol:team-session-updated", refreshProfile);
    window.addEventListener("storage", refreshProfile);

    return () => {
      window.removeEventListener("firecontrol:team-session-updated", refreshProfile);
      window.removeEventListener("storage", refreshProfile);
    };
  }, []);

  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 60_000);

    return () => window.clearInterval(timer);
  }, []);

  function handleLogout() {
    localStorage.removeItem("firecontrol:team-session");
    window.location.href = "/login";
  }

  const currentDateTime = now
    ? `${new Intl.DateTimeFormat("bg-BG", { weekday: "short" })
        .format(now)
        .replace(".", "")} · ${new Intl.DateTimeFormat("bg-BG", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
        .format(now)
        .replace(" г.,", "")
        .replace(",", " ·")}`
    : "";

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 px-4 py-3 shadow-[0_1px_0_rgba(15,23,42,0.03)] backdrop-blur-xl sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
            {title}
          </h1>
          <p className="mt-0.5 line-clamp-2 text-sm font-medium leading-5 text-slate-500">
            {description}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-2.5">
          {headerAction}

          {showSearch ? (
            <div className="hidden h-11 min-w-64 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-4 text-slate-400 shadow-inner md:flex">
              <Search size={18} />
              <span className="text-sm font-medium">Търсене...</span>
            </div>
          ) : null}

          {currentDateTime ? (
            <div
              className="hidden items-center whitespace-nowrap px-2 text-xs font-bold text-slate-400 xl:flex"
              title="Текущи дата и час"
            >
              {currentDateTime}
            </div>
          ) : null}

          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 hover:shadow-md active:bg-orange-100/70"
            aria-label="Известия"
            title="Известия"
          >
            <Bell size={18} />
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm hover:border-red-200 hover:bg-red-50 hover:text-red-700 hover:shadow-md active:bg-red-100/70"
            aria-label="Изход"
            title="Изход"
          >
            <LogOut size={18} />
          </button>

          <Link
            href="/profile"
            className="group flex h-11 min-w-0 shrink-0 items-center gap-3 rounded-full border border-slate-200 bg-white py-1 pl-3 pr-1 text-left shadow-sm transition hover:border-orange-200 hover:bg-orange-50 hover:shadow-md"
            title={profile ? `${profile.name} (${profile.employee_code})` : "Профил"}
            aria-label="Моят профил"
          >
            <span className="hidden min-w-0 max-w-36 flex-col leading-tight lg:flex">
              <span className="truncate text-sm font-black text-slate-800 group-hover:text-orange-700">
                {profile?.name || "Профил"}
              </span>
              <span className="truncate text-[11px] font-bold text-slate-400">
                {profile?.role || profile?.employee_code || "Потребител"}
              </span>
            </span>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-orange-50 text-xs font-black text-orange-700 ring-1 ring-orange-100">
              {profile?.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.photo_url} alt={profile.name} className="h-full w-full object-cover" />
              ) : profile ? (
                getTeamMemberInitials(profile.name)
              ) : (
                <UserRound size={17} />
              )}
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}
