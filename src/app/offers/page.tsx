import { CommercialPipelinePage } from "../../components/commercial-pipeline-page";
import type { PipelineItem } from "../../components/commercial-pipeline-page";

const offers: PipelineItem[] = [
  {
    id: "offer-1",
    title: "OF-2026-0018",
    subtitle: "Шумен Ритейл Груп АД",
    status: "Изпратена",
    statusVariant: "orange",
    action: "Създай поръчка",
    meta: <div className="text-xl font-black text-slate-950">4 850 €</div>,
    fields: [
      { label: "Клиент", value: "Шумен Ритейл Груп АД" },
      { label: "Обект", value: "МОЛ Шумен" },
      { label: "Услуги", value: "Абонамент, пожарогасители, QR етикети" },
      { label: "Валидна до", value: "15.05.2026" },
    ],
  },
  {
    id: "offer-2",
    title: "OF-2026-0021",
    subtitle: "Север Логистик ЕООД",
    status: "Чернова",
    statusVariant: "neutral",
    action: "Създай поръчка",
    meta: <div className="text-xl font-black text-slate-950">2 320 €</div>,
    fields: [
      { label: "Клиент", value: "Север Логистик ЕООД" },
      { label: "Обект", value: "Склад Север" },
      { label: "Услуги", value: "Пожарогасители и аварийно осветление" },
      { label: "Валидна до", value: "22.05.2026" },
    ],
  },
  {
    id: "offer-3",
    title: "OF-2026-0024",
    subtitle: "Централ Хотелс ООД",
    status: "Приета",
    statusVariant: "success",
    action: "Създай поръчка",
    meta: <div className="text-xl font-black text-slate-950">7 900 €</div>,
    fields: [
      { label: "Клиент", value: "Централ Хотелс ООД" },
      { label: "Обект", value: "Хотел Централ" },
      { label: "Услуги", value: "Система, евакуация, сервизен договор" },
      { label: "Валидна до", value: "30.05.2026" },
    ],
  },
  {
    id: "offer-4",
    title: "OF-2026-0027",
    subtitle: "Север Инвест АД",
    status: "Отказана",
    statusVariant: "danger",
    action: "Създай поръчка",
    meta: <div className="text-xl font-black text-slate-950">1 640 €</div>,
    fields: [
      { label: "Клиент", value: "Север Инвест АД" },
      { label: "Обект", value: "Офис сграда Център" },
      { label: "Услуги", value: "Първоначален одит и профилактика" },
      { label: "Валидна до", value: "10.05.2026" },
    ],
  },
];

export default function OffersPage() {
  return (
    <CommercialPipelinePage
      title="Оферти"
      description="Предложения за услуги, цени и обекти"
      searchPlaceholder="Търсене по оферта, клиент или обект..."
      primaryAction="Нова оферта"
      items={offers}
    />
  );
}
