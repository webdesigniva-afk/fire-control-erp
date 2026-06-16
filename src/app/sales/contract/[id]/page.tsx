import { PrintButton } from "../../../../components/print-button";

type ContractPageProps = {
  params: Promise<{ id: string }>;
};

const contracts = {
  "1": {
    number: "CTR-2026-0042",
    date: "29.04.2026",
    client: "Централ Хотелс ООД",
    object: "Хотел Централ",
    address: "ул. Оборище 8, 9700 Шумен",
    contact: "Анелия Димитрова",
    preparedBy: "Иван Петров",
    type: "Абонаментно обслужване",
  },
};

const services = [
  {
    name: "Абонаментно обслужване",
    periodicity: "месечно",
    object: "Хотел Централ",
    price: 220,
  },
  {
    name: "Пожарогасители",
    periodicity: "на 6 месеца",
    object: "Хотел Централ",
    price: 810,
  },
  {
    name: "QR етикети",
    periodicity: "при промяна",
    object: "Хотел Централ",
    price: 192,
  },
  {
    name: "Пожароизвестителна система",
    periodicity: "по график",
    object: "Хотел Централ",
    price: 1250,
  },
];

const terms = [
  {
    title: "Предмет на договора",
    text: "Изпълнителят се задължава да извършва сервизно обслужване, профилактика, проверки и документиране на системите и оборудването, свързани с пожарната безопасност на обекта.",
  },
  {
    title: "Срок на договора",
    text: "Договорът се сключва за срок от 12 месеца, считано от датата на подписване, освен ако страните не договорят друго в писмена форма.",
  },
  {
    title: "Задължения на изпълнителя",
    text: "Изпълнителят осигурява квалифициран персонал, планира посещенията, извършва проверки и предоставя протоколи за извършените дейности.",
  },
  {
    title: "Задължения на клиента",
    text: "Клиентът осигурява достъп до обекта, лице за контакт и необходимите условия за безопасно извършване на сервизните дейности.",
  },
  {
    title: "Условия за подновяване",
    text: "Договорът може да бъде подновен след писмено потвърждение от страните не по-късно от 30 дни преди изтичане на срока.",
  },
  {
    title: "Доставка / вземане от сервиз",
    text: "Доставката и вземането на оборудване от сервиз се извършват по предварително съгласуван график и се документират с приемо-предавателен протокол.",
  },
];

function formatAmount(amount: number) {
  return new Intl.NumberFormat("bg-BG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export default async function ContractPrintPage({ params }: ContractPageProps) {
  const { id } = await params;
  const contract = contracts[id as keyof typeof contracts] ?? contracts["1"];

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-black print:bg-white print:p-0">
      <div className="no-print mx-auto mb-4 flex w-full max-w-[800px] justify-end">
        <PrintButton />
      </div>

      <article className="mx-auto min-h-[1120px] w-full max-w-[800px] bg-white p-10 text-[12px] leading-5 shadow-sm print:min-h-0 print:max-w-none print:p-0 print:shadow-none">
        <header className="border-b-2 border-black pb-6">
          <div className="grid grid-cols-[1fr_auto] gap-8">
            <div>
              <div className="text-3xl font-black tracking-tight">
                FIRE<span className="text-orange-600 print:text-black">Control</span>
              </div>
              <div className="mt-1 text-[11px] font-bold uppercase tracking-wide">
                Пожарна безопасност, сервиз и абонаментно обслужване
              </div>
              <div className="mt-4 text-[11px] leading-5">
                гр. Шумен, ул. “Владайско въстание” No 152
                <br />
                GSM: 0896 089 991
                <br />
                office@firecontrol.bg
              </div>
            </div>

            <div className="text-right">
              <h1 className="max-w-[340px] text-[28px] font-black leading-tight tracking-wide">
                ДОГОВОР ЗА ОБСЛУЖВАНЕ
              </h1>
              <div className="mt-4 grid grid-cols-[120px_170px] border border-black text-left">
                <div className="border-b border-r border-black px-3 py-2 font-bold">
                  Номер
                </div>
                <div className="border-b border-black px-3 py-2">
                  {contract.number}
                </div>
                <div className="border-r border-black px-3 py-2 font-bold">
                  Дата
                </div>
                <div className="px-3 py-2">{contract.date}</div>
              </div>
            </div>
          </div>
        </header>

        <section className="mt-7 grid grid-cols-2 gap-6">
          <div className="border-2 border-black">
            <div className="border-b-2 border-black bg-slate-100 px-3 py-2 font-black print:bg-white">
              Възложител
            </div>
            <div className="space-y-2 p-3">
              <div>
                <span className="font-bold">Клиент:</span> {contract.client}
              </div>
              <div>
                <span className="font-bold">Лице за контакт:</span>{" "}
                {contract.contact}
              </div>
              <div>
                <span className="font-bold">Обект:</span> {contract.object}
              </div>
              <div>
                <span className="font-bold">Адрес:</span> {contract.address}
              </div>
            </div>
          </div>

          <div className="border-2 border-black">
            <div className="border-b-2 border-black bg-slate-100 px-3 py-2 font-black print:bg-white">
              Тип договор
            </div>
            <div className="p-3">
              <div className="text-lg font-black">{contract.type}</div>
              <p className="mt-3 text-[11px] leading-5">
                Типовете договори ще се настройват според реалните шаблони на
                FireControl.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-7">
          <table className="w-full table-fixed border-collapse border-2 border-black text-[11px]">
            <thead>
              <tr className="bg-slate-100 print:bg-white">
                <th className="w-10 border border-black px-2 py-2 text-center">
                  №
                </th>
                <th className="border border-black px-2 py-2 text-left">
                  Услуга
                </th>
                <th className="w-28 border border-black px-2 py-2 text-left">
                  Периодичност
                </th>
                <th className="w-32 border border-black px-2 py-2 text-left">
                  Обект
                </th>
                <th className="w-24 border border-black px-2 py-2 text-right">
                  Цена
                </th>
              </tr>
            </thead>
            <tbody>
              {services.map((service, index) => (
                <tr key={service.name}>
                  <td className="border border-black px-2 py-3 text-center font-bold">
                    {index + 1}
                  </td>
                  <td className="border border-black px-2 py-3 font-bold">
                    {service.name}
                  </td>
                  <td className="border border-black px-2 py-3">
                    {service.periodicity}
                  </td>
                  <td className="border border-black px-2 py-3">
                    {service.object}
                  </td>
                  <td className="border border-black px-2 py-3 text-right font-bold">
                    {formatAmount(service.price)} лв.
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mt-7 space-y-4">
          {terms.map((term) => (
            <div key={term.title} className="avoid-break border-2 border-black">
              <div className="border-b-2 border-black bg-slate-100 px-3 py-2 font-black print:bg-white">
                {term.title}
              </div>
              <div className="min-h-16 p-3 text-[12px] leading-6">{term.text}</div>
            </div>
          ))}
        </section>

        <footer className="avoid-break mt-10 grid grid-cols-2 gap-12">
          <div>
            <div className="font-bold">Изпълнител:</div>
            <div className="mt-3">FireControl</div>
            <div className="mt-10 border-b border-black" />
            <div className="mt-1 text-center text-[11px]">подпис и печат</div>
          </div>

          <div>
            <div className="font-bold">Клиент:</div>
            <div className="mt-3">{contract.client}</div>
            <div className="mt-10 border-b border-black" />
            <div className="mt-1 text-center text-[11px]">подпис и печат</div>
          </div>
        </footer>
      </article>

      <style>{`
        @page {
          size: A4;
          margin: 15mm;
        }

        @media print {
          html,
          body {
            background: white !important;
            color: black !important;
          }

          .no-print {
            display: none !important;
          }

          article {
            box-shadow: none !important;
            border-radius: 0 !important;
          }

          thead {
            display: table-header-group;
          }

          tr,
          section,
          footer,
          .avoid-break {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>
    </main>
  );
}
