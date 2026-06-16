import { PrintButton } from "../../../../components/print-button";
import { OfferActions } from "../../../../components/offer-actions";

type OfferPageProps = {
  params: Promise<{ id: string }>;
};

const offers = {
  "1": {
    number: "OF-2026-0018",
    date: "29.04.2026",
    validUntil: "15.05.2026",
    client: "Шумен Ритейл Груп АД",
    contact: "Мария Георгиева",
    object: "МОЛ Шумен",
    address: "бул. Симеон Велики 46, 9700 Шумен",
    preparedBy: "Георги Димитров",
  },
};

const services = [
  {
    name: "Абонаментно обслужване",
    description: "Месечна профилактика, проверки и сервизна поддръжка",
    quantity: 12,
    unitPrice: 220,
  },
  {
    name: "Пожарогасители",
    description: "Проверка, стикериране и обслужване на пожарогасители",
    quantity: 18,
    unitPrice: 45,
  },
  {
    name: "QR етикети",
    description: "Етикети за дигитален паспорт на обекта и оборудването",
    quantity: 24,
    unitPrice: 8,
  },
  {
    name: "Пожароизвестителна система",
    description: "Преглед, тест и документиране на пожароизвестителна система",
    quantity: 1,
    unitPrice: 1250,
  },
];

function formatAmount(amount: number) {
  return new Intl.NumberFormat("bg-BG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export default async function OfferPrintPage({ params }: OfferPageProps) {
  const { id } = await params;
  const offer = offers[id as keyof typeof offers] ?? offers["1"];
  const subtotal = services.reduce(
    (sum, service) => sum + service.quantity * service.unitPrice,
    0
  );
  const vat = subtotal * 0.2;
  const total = subtotal + vat;

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-black print:bg-white print:p-0">
      <div className="no-print mx-auto mb-4 flex w-full max-w-[800px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <OfferActions
          address={offer.address}
          client={offer.client}
          number={offer.number}
          object={offer.object}
          total={`${formatAmount(total)} лв.`}
        />
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
              <h1 className="text-[34px] font-black tracking-wide">ОФЕРТА</h1>
              <div className="mt-4 grid grid-cols-[110px_150px] border border-black text-left">
                <div className="border-b border-r border-black px-3 py-2 font-bold">
                  Номер
                </div>
                <div className="border-b border-black px-3 py-2">
                  {offer.number}
                </div>
                <div className="border-b border-r border-black px-3 py-2 font-bold">
                  Дата
                </div>
                <div className="border-b border-black px-3 py-2">
                  {offer.date}
                </div>
                <div className="border-r border-black px-3 py-2 font-bold">
                  Валидна до
                </div>
                <div className="px-3 py-2">{offer.validUntil}</div>
              </div>
            </div>
          </div>
        </header>

        <section className="mt-7 grid grid-cols-2 gap-6">
          <div className="border-2 border-black">
            <div className="border-b-2 border-black bg-slate-100 px-3 py-2 font-black print:bg-white">
              Клиент
            </div>
            <div className="space-y-2 p-3">
              <div>
                <span className="font-bold">Фирма:</span> {offer.client}
              </div>
              <div>
                <span className="font-bold">Лице за контакт:</span>{" "}
                {offer.contact}
              </div>
              <div>
                <span className="font-bold">Обект:</span> {offer.object}
              </div>
              <div>
                <span className="font-bold">Адрес:</span> {offer.address}
              </div>
            </div>
          </div>

          <div className="border-2 border-black">
            <div className="border-b-2 border-black bg-slate-100 px-3 py-2 font-black print:bg-white">
              Предмет на офертата
            </div>
            <div className="p-3 leading-6">
              Предложение за услуги, свързани с пожарна безопасност,
              абонаментно обслужване, сервиз, документиране и идентификация на
              обекти и оборудване.
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
                <th className="w-[170px] border border-black px-2 py-2 text-left">
                  Услуга
                </th>
                <th className="border border-black px-2 py-2 text-left">
                  Описание
                </th>
                <th className="w-20 border border-black px-2 py-2 text-center">
                  Количество
                </th>
                <th className="w-24 border border-black px-2 py-2 text-right">
                  Ед. цена
                </th>
                <th className="w-24 border border-black px-2 py-2 text-right">
                  Общо
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
                    {service.description}
                  </td>
                  <td className="border border-black px-2 py-3 text-center">
                    {service.quantity}
                  </td>
                  <td className="border border-black px-2 py-3 text-right">
                    {formatAmount(service.unitPrice)} лв.
                  </td>
                  <td className="border border-black px-2 py-3 text-right font-bold">
                    {formatAmount(service.quantity * service.unitPrice)} лв.
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mt-6 flex justify-end">
          <div className="w-80 border-2 border-black text-[12px]">
            <div className="grid grid-cols-2 border-b border-black">
              <div className="border-r border-black px-3 py-2 font-bold">
                Междинна сума
              </div>
              <div className="px-3 py-2 text-right">
                {formatAmount(subtotal)} лв.
              </div>
            </div>
            <div className="grid grid-cols-2 border-b border-black">
              <div className="border-r border-black px-3 py-2 font-bold">
                ДДС 20%
              </div>
              <div className="px-3 py-2 text-right">{formatAmount(vat)} лв.</div>
            </div>
            <div className="grid grid-cols-2 text-[14px] font-black">
              <div className="border-r border-black px-3 py-2">Общо</div>
              <div className="px-3 py-2 text-right">{formatAmount(total)} лв.</div>
            </div>
          </div>
        </section>

        <section className="avoid-break mt-7 border-2 border-black">
          <div className="border-b-2 border-black bg-slate-100 px-3 py-2 font-black print:bg-white">
            Условия
          </div>
          <div className="grid grid-cols-[170px_1fr] text-[12px]">
            <div className="border-b border-r border-black px-3 py-2 font-bold">
              Срок на валидност
            </div>
            <div className="border-b border-black px-3 py-2">
              Офертата е валидна до {offer.validUntil}.
            </div>
            <div className="border-b border-r border-black px-3 py-2 font-bold">
              Условия за плащане
            </div>
            <div className="border-b border-black px-3 py-2">
              50% авансово плащане при потвърждение и 50% след приключване на
              дейностите.
            </div>
            <div className="border-r border-black px-3 py-2 font-bold">
              Забележки
            </div>
            <div className="px-3 py-2">
              Цените са ориентировъчни и могат да бъдат прецизирани след оглед
              на обекта и финално потвърждение на обхвата.
            </div>
          </div>
        </section>

        <footer className="avoid-break mt-12 grid grid-cols-2 gap-12">
          <div>
            <div className="font-bold">Изготвил:</div>
            <div className="mt-3">{offer.preparedBy}</div>
            <div className="mt-10 border-b border-black" />
            <div className="mt-1 text-center text-[11px]">име и подпис</div>
          </div>

          <div>
            <div className="font-bold">Подпис/печат:</div>
            <div className="mt-16 h-24 border-2 border-black text-center text-[11px] font-bold leading-[6rem]">
              Място за подпис и печат
            </div>
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
