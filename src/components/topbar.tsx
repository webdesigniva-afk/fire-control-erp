"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Bell, LogOut, Search } from "lucide-react";
import { getTeamMemberInitials, type TeamMember } from "../lib/team-members";

type TopbarProps = {
  title: string;
  description: string;
  headerAction?: ReactNode;
};

export function Topbar({ title, description, headerAction }: TopbarProps) {
  const [profile, setProfile] = useState<TeamMember | null>(null);

  useEffect(() => {
    const rawProfile = localStorage.getItem("firecontrol:team-session");
    if (!rawProfile) return;

    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProfile(JSON.parse(rawProfile) as TeamMember);
    } catch {
      localStorage.removeItem("firecontrol:team-session");
    }
  }, []);

  function handleLogout() {
    localStorage.removeItem("firecontrol:team-session");
    window.location.href = "/login";
  }

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

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {headerAction}

          <div className="hidden h-11 min-w-64 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-4 text-slate-400 shadow-inner md:flex">
            <Search size={18} />
            <span className="text-sm font-medium">Търсене...</span>
          </div>

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

          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-orange-50 text-sm font-black text-orange-700 shadow-sm"
            title={profile ? `${profile.name} (${profile.employee_code})` : "Профил"}
          >
            {profile?.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.photo_url} alt={profile.name} className="h-full w-full object-cover" />
            ) : (
              getTeamMemberInitials(profile?.name ?? "")
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
