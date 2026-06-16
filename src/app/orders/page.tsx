import { CommercialPipelinePage } from "../../components/commercial-pipeline-page";
import type { PipelineItem } from "../../components/commercial-pipeline-page";

const orders: PipelineItem[] = [
  {
    id: "order-1",
    title: "ORD-2026-0112",
    subtitle: "Приета оферта OF-2026-0024",
    status: "Нова",
    statusVariant: "orange",
    action: "Създай договор",
    fields: [
      { label: "Клиент", value: "Централ Хотелс ООД" },
      { label: "Обект", value: "Хотел Централ" },
      { label: "Услуги", value: "Система, евакуация, сервизен договор" },
      { label: "Отговорник", value: "Иван Петров" },
      { label: "Срок", value: "12.05.2026" },
    ],
  },
  {
    id: "order-2",
    title: "ORD-2026-0115",
    subtitle: "Приета оферта OF-2026-0018",
    status: "В процес",
    statusVariant: "warning",
    action: "Създай договор",
    fields: [
      { label: "Клиент", value: "Шумен Ритейл Груп АД" },
      { label: "Обект", value: "МОЛ Шумен" },
      { label: "Услуги", value: "Абонамент, пожарогасители, QR етикети" },
      { label: "Отговорник", value: "Георги Димитров" },
      { label: "Срок", value: "18.05.2026" },
    ],
  },
  {
    id: "order-3",
    title: "ORD-2026-0119",
    subtitle: "Приета оферта OF-2026-0021",
    status: "Изпълнена",
    statusVariant: "success",
    action: "Създай договор",
    fields: [
      { label: "Клиент", value: "Север Логистик ЕООД" },
      { label: "Обект", value: "Склад Север" },
      { label: "Услуги", value: "Пожарогасители и аварийно осветление" },
      { label: "Отговорник", value: "Николай Стоянов" },
      { label: "Срок", value: "25.05.2026" },
    ],
  },
];

export default function OrdersPage() {
  return (
    <CommercialPipelinePage
      title="Поръчки"
      description="Приети оферти, готови за изпълнение"
      searchPlaceholder="Търсене по поръчка, клиент или отговорник..."
      primaryAction="Нова поръчка"
      items={orders}
    />
  );
}
