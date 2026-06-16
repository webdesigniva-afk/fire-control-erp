import { CommercialPipelinePage } from "../../components/commercial-pipeline-page";
import type { PipelineItem } from "../../components/commercial-pipeline-page";

const contracts: PipelineItem[] = [
  {
    id: "contract-1",
    title: "CTR-2026-0042",
    subtitle: "Шумен Ритейл Груп АД",
    status: "Активен",
    statusVariant: "success",
    action: "Отвори",
    fields: [
      { label: "Клиент", value: "Шумен Ритейл Груп АД" },
      { label: "Тип договор", value: "Абонаментно обслужване" },
      { label: "Начална дата", value: "01.04.2026" },
      { label: "Крайна дата", value: "31.03.2027" },
      { label: "Напомняне", value: "30 дни преди изтичане" },
    ],
  },
  {
    id: "contract-2",
    title: "CTR-2025-0188",
    subtitle: "Север Логистик ЕООД",
    status: "Изтича скоро",
    statusVariant: "warning",
    action: "Отвори",
    fields: [
      { label: "Клиент", value: "Север Логистик ЕООД" },
      { label: "Тип договор", value: "Пожарогасители и сервиз" },
      { label: "Начална дата", value: "15.06.2025" },
      { label: "Крайна дата", value: "14.06.2026" },
      { label: "Напомняне", value: "Подновяване до 15.05.2026" },
    ],
  },
  {
    id: "contract-3",
    title: "CTR-2025-0114",
    subtitle: "Център Бизнес Парк АД",
    status: "Изтекъл",
    statusVariant: "danger",
    action: "Отвори",
    fields: [
      { label: "Клиент", value: "Център Бизнес Парк АД" },
      { label: "Тип договор", value: "Профилактика и аварийна реакция" },
      { label: "Начална дата", value: "01.03.2025" },
      { label: "Крайна дата", value: "28.02.2026" },
      { label: "Напомняне", value: "Просрочено подновяване" },
    ],
  },
];

export default function ContractsPage() {
  return (
    <CommercialPipelinePage
      title="Договори"
      description="Активни договори, срокове и обслужване"
      searchPlaceholder="Търсене по договор, клиент или тип..."
      primaryAction="Нов договор"
      items={contracts}
    />
  );
}
