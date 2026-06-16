"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Building2,
  CalendarCheck,
  ChartNoAxesColumnIncreasing,
  ClipboardCheck,
  Flame,
  PanelLeft,
  PanelLeftClose,
  PanelLeftDashed,
  LayoutDashboard,
  MapPinned,
  Settings,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

type MenuItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

type SidebarMode = "open" | "hover" | "icons";

const sidebarStorageKey = "firecontrol-sidebar-mode";

const menu: MenuItem[] = [
  { label: "Дашборд", href: "/dashboard", icon: LayoutDashboard },
  { label: "Продажби", href: "/sales", icon: ChartNoAxesColumnIncreasing },
  { label: "Клиенти", href: "/clients", icon: Users },
  { label: "Екип", href: "/team", icon: UsersRound },
  { label: "Обекти", href: "/locations", icon: Building2 },
  { label: "Карта", href: "/map", icon: MapPinned },
  { label: "Задачи", href: "/tasks", icon: CalendarCheck },
  { label: "Протоколи", href: "/protocols", icon: ClipboardCheck },
  { label: "Настройки", href: "/settings", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [mode, setMode] = useState<SidebarMode>("open");
  const [isHovered, setIsHovered] = useState(false);
  const isExpanded = mode === "open" || (mode === "hover" && isHovered);

  useEffect(() => {
    const savedMode = window.localStorage.getItem(sidebarStorageKey);

    if (
      savedMode === "open" ||
      savedMode === "hover" ||
      savedMode === "icons"
    ) {
      setMode(savedMode);
    }
  }, []);

  function changeMode(nextMode: SidebarMode) {
    setMode(nextMode);
    window.localStorage.setItem(sidebarStorageKey, nextMode);
  }

  return (
    <aside
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`sticky top-0 z-30 shrink-0 overflow-y-auto border-b border-slate-200/80 bg-white/95 shadow-[1px_0_0_rgba(15,23,42,0.03)] backdrop-blur-xl transition-[width] duration-200 md:h-screen md:border-b-0 md:border-r ${
        isExpanded
          ? "w-full px-4 py-4 md:w-72 md:px-5 md:py-6"
          : "w-full px-3 py-3 md:w-20 md:py-6"
      }`}
    >
      <div className="flex h-full flex-col">
        <div
          className={`flex items-center ${
            isExpanded ? "gap-3" : "justify-center"
          }`}
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-red-600 via-red-500 to-orange-400 text-white shadow-[0_12px_28px_rgba(239,68,68,0.22)]">
            <Flame size={24} />
          </div>
          <div className={isExpanded ? "block min-w-0" : "hidden"}>
            <div className="text-xl font-black tracking-tight text-slate-950">
              FIRE<span className="text-orange-500">Control</span>
            </div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              ERP Platform
            </div>
          </div>
        </div>

        <nav className="mt-5 flex gap-1 overflow-x-auto pb-1 md:mt-8 md:block md:space-y-1 md:overflow-visible md:pb-0">
          {menu.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                title={!isExpanded ? item.label : undefined}
                className={`relative flex shrink-0 items-center rounded-xl py-2.5 text-sm font-semibold transition md:w-full ${
                  isExpanded ? "gap-3 px-3.5" : "justify-center px-3 md:px-0"
                } ${
                  isActive
                    ? "bg-gradient-to-r from-red-600 via-red-500 to-orange-400 text-white shadow-[0_10px_24px_rgba(239,68,68,0.18)]"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-950"
                }`}
              >
                <Icon size={18} className="shrink-0" />
                <span className={isExpanded ? "block" : "hidden"}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto hidden space-y-3 md:block">
          <div
            className={`flex rounded-xl border border-slate-200 bg-slate-50 p-1 ${
              isExpanded ? "justify-between" : "flex-col gap-1"
            }`}
          >
            {[
              {
                value: "open" as const,
                label: "Постоянно отворена",
                icon: PanelLeft,
              },
              {
                value: "hover" as const,
                label: "Разтваряне при hover",
                icon: PanelLeftDashed,
              },
              {
                value: "icons" as const,
                label: "Само икони",
                icon: PanelLeftClose,
              },
            ].map((option) => {
              const Icon = option.icon;
              const selected = mode === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  title={option.label}
                  aria-label={option.label}
                  onClick={() => changeMode(option.value)}
                  className={`flex h-8 items-center justify-center rounded-lg text-xs font-black transition ${
                    isExpanded ? "w-1/3" : "w-full"
                  } ${
                    selected
                      ? "bg-white text-orange-600 shadow-sm"
                      : "text-slate-400 hover:bg-white hover:text-slate-700"
                  }`}
                >
                  <Icon size={15} />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </aside>
  );
}
