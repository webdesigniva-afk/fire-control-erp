"use client";

import {
  Bell,
  Camera,
  ClipboardList,
  FileText,
  Home,
  Map,
  MapPin,
  MessageSquareText,
  Phone,
  PlayCircle,
  QrCode,
  Route,
  UserRound,
} from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { QrScannerButton } from "../../components/qr-scanner";

const stops = [
  { time: "09:30", object: "МОЛ Шумен" },
  { time: "11:00", object: "Склад Север" },
  { time: "14:30", object: "Хотел Централ" },
];

const tasks = [
  {
    object: "МОЛ Шумен",
    address: "бул. Симеон Велики 46",
    service: "Месечна проверка",
    time: "09:30",
    status: "Предстои",
  },
  {
    object: "Склад Север",
    address: "Индустриална зона Север",
    service: "Пожарогасители",
    time: "11:00",
    status: "Предстои",
  },
  {
    object: "Хотел Централ",
    address: "пл. Освобождение 4",
    service: "Протокол за поддръжка на ПИС",
    time: "14:30",
    status: "Планирана",
  },
  {
    object: "Офис сграда Център",
    address: "ул. Цар Освободител 22",
    service: "Контролна проверка",
    time: "16:00",
    status: "Планирана",
  },
  {
    object: "Логистичен парк Изток",
    address: "бул. Тракия 18",
    service: "QR етикети",
    time: "17:15",
    status: "Нисък риск",
  },
];

const quickActions = [
  { label: "Нов протокол", icon: FileText },
  { label: "Снимка", icon: Camera },
  { label: "Бележка", icon: MessageSquareText },
  { label: "Обаждане", icon: Phone },
];

const bottomNav = [
  { label: "Днес", icon: Home, active: true },
  { label: "QR", icon: QrCode },
  { label: "Задачи", icon: ClipboardList },
  { label: "Профил", icon: UserRound },
];

function statusVariant(status: string) {
  if (status === "Предстои") return "warning";
  if (status === "Планирана") return "orange";
  return "neutral";
}

export default function TechnicianPage() {
  return (
    <main className="min-h-screen bg-[#f7f8fb] pb-28 text-slate-900">
      <div className="mx-auto w-full max-w-xl px-4 py-5">
        <header className="flex items-start justify-between gap-4">
          <div>
            <img
              src="/firecontrol-header-logo.png"
              alt="FIREControl"
              className="h-8 w-auto object-contain object-left"
            />
            <h1 className="mt-1 text-3xl font-black tracking-tight">
              Здравей, Иван
            </h1>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Днес имаш 5 задачи
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="success">На линия</Badge>
            <button className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm">
              <Bell size={18} />
            </button>
          </div>
        </header>

        <section className="mt-6">
          <QrScannerButton buttonClassName="flex min-h-20 w-full items-center justify-center gap-3 rounded-3xl bg-gradient-to-r from-red-500 to-orange-400 px-6 text-lg font-black text-white shadow-sm transition hover:shadow-md">
            <QrCode size={26} />
            Сканирай QR код
          </QrScannerButton>
        </section>

        <Card className="mt-6 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black">Маршрут за днес</h2>
              <p className="mt-1 text-sm text-slate-500">
                Оптимизиран ред на посещенията
              </p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
              <Route size={22} />
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {stops.map((stop) => (
              <div
                key={stop.time}
                className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4"
              >
                <div className="rounded-xl bg-white px-3 py-2 text-sm font-black text-orange-600 shadow-sm">
                  {stop.time}
                </div>
                <div className="font-bold text-slate-800">{stop.object}</div>
              </div>
            ))}
          </div>

          <Button variant="outline" className="mt-5 w-full">
            <Map size={18} />
            Отвори маршрут
          </Button>
        </Card>

        <section className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black">Задачи</h2>
            <Badge variant="orange">{tasks.length}</Badge>
          </div>

          <div className="mt-4 space-y-4">
            {tasks.map((task) => (
              <Card key={`${task.object}-${task.time}`} className="p-5" hover>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black">{task.object}</h3>
                    <div className="mt-2 flex items-start gap-2 text-sm text-slate-500">
                      <MapPin size={16} />
                      {task.address}
                    </div>
                  </div>
                  <Badge variant={statusVariant(task.status)}>
                    {task.status}
                  </Badge>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4">
                  <div>
                    <div className="text-xs font-bold uppercase text-slate-400">
                      Сервиз
                    </div>
                    <div className="mt-1 text-sm font-black text-slate-800">
                      {task.service}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase text-slate-400">
                      Час
                    </div>
                    <div className="mt-1 text-sm font-black text-slate-800">
                      {task.time}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Button variant="outline" className="w-full">
                    Отвори
                  </Button>
                  <Button className="w-full">
                    <PlayCircle size={18} />
                    Започни
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="text-lg font-black">Бързи действия</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {quickActions.map((action) => {
              const Icon = action.icon;

              return (
                <button
                  key={action.label}
                  className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-3xl border border-slate-200 bg-white p-4 text-sm font-black text-slate-700 shadow-sm transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                >
                  <Icon size={22} />
                  {action.label}
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/90 px-4 py-3 shadow-[0_-12px_30px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="mx-auto grid max-w-xl grid-cols-4 gap-2">
          {bottomNav.map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.label}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-xs font-black transition ${
                  item.active
                    ? "bg-orange-50 text-orange-600"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon size={19} />
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>
    </main>
  );
}
