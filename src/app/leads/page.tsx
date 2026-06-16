import { CommercialPipelinePage } from "../../components/commercial-pipeline-page";
import type { PipelineItem } from "../../components/commercial-pipeline-page";

const leads: PipelineItem[] = [
  {
    id: "lead-1",
    title: "Алфа Ритейл ООД",
    subtitle: "Запитване за абонаментна поддръжка",
    status: "Нов",
    statusVariant: "orange",
    action: "Създай оферта",
    fields: [
      { label: "Лице за контакт", value: "Мария Стоянова" },
      { label: "Телефон", value: "+359 88 456 1020" },
      { label: "Email", value: "office@alfa-retail.bg" },
      { label: "Източник", value: "Уеб форма" },
    ],
  },
  {
    id: "lead-2",
    title: "Складова база Тракия",
    subtitle: "Проверка на пожарогасители и хидранти",
    status: "Свързан",
    statusVariant: "neutral",
    action: "Създай оферта",
    fields: [
      { label: "Лице за контакт", value: "Иван Колев" },
      { label: "Телефон", value: "+359 89 220 1188" },
      { label: "Email", value: "i.kolev@trakia-base.bg" },
      { label: "Източник", value: "Телефон" },
    ],
  },
  {
    id: "lead-3",
    title: "Хотел Панорама",
    subtitle: "Нова пожароизвестителна система",
    status: "За оферта",
    statusVariant: "warning",
    action: "Създай оферта",
    fields: [
      { label: "Лице за контакт", value: "Елена Георгиева" },
      { label: "Телефон", value: "+359 87 900 3321" },
      { label: "Email", value: "manager@panorama-hotel.bg" },
      { label: "Източник", value: "Препоръка" },
    ],
  },
  {
    id: "lead-4",
    title: "Север Инвест АД",
    subtitle: "Проучване за сервизен договор",
    status: "Отказан",
    statusVariant: "danger",
    action: "Създай оферта",
    fields: [
      { label: "Лице за контакт", value: "Петър Димитров" },
      { label: "Телефон", value: "+359 88 778 4510" },
      { label: "Email", value: "contact@sever-invest.bg" },
      { label: "Източник", value: "Имейл кампания" },
    ],
  },
];

export default function LeadsPage() {
  return (
    <CommercialPipelinePage
      title="Лийдове"
      description="Запитвания и потенциални клиенти"
      searchPlaceholder="Търсене по фирма, контакт, телефон или email..."
      primaryAction="Нов лийд"
      items={leads}
    />
  );
}
