import { ExtinguisherPrintDocument } from "./print-document";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type ExtinguisherProtocolRow = {
  id: string;
  equipmentId?: string;
  rowNumber: string;
  brand?: string;
  model?: string;
  serialNumber?: string;
  identificationMarking: string;
  category: string;
  chargeMassKg: string;
  extinguishingAgentType: string;
  extinguishingAgentTradeName: string;
  serviceType: string;
  resultStatus?: string;
  problemNote?: string;
  serviceDate: string;
  nextServiceDate?: string;
  servicePersonName: string;
  servicePersonSignatureDataUrl: string;
  stickerNumber: string;
};

const mockExtinguisherRows: ExtinguisherProtocolRow[] = [
  {
    id: "ext-1",
    rowNumber: "1",
    identificationMarking: "Пожарогасител ABC 6 kg, модел PG-6, SN-FC-10021",
    category: "Прахов",
    chargeMassKg: "6",
    extinguishingAgentType: "прах",
    extinguishingAgentTradeName: "ABC 40",
    serviceType: "техническо обслужване",
    serviceDate: "2026-04-12",
    servicePersonName: "Иван Петров",
    servicePersonSignatureDataUrl: "",
    stickerNumber: "ST-240182",
  },
  {
    id: "ext-2",
    rowNumber: "2",
    identificationMarking: "Пожарогасител ABC 6 kg, модел PG-6, SN-FC-10022",
    category: "Прахов",
    chargeMassKg: "6",
    extinguishingAgentType: "прах",
    extinguishingAgentTradeName: "ABC 40",
    serviceType: "техническо обслужване",
    serviceDate: "2026-04-12",
    servicePersonName: "Иван Петров",
    servicePersonSignatureDataUrl: "",
    stickerNumber: "ST-240183",
  },
  {
    id: "ext-3",
    rowNumber: "3",
    identificationMarking: "Пожарогасител CO₂ 5 kg, модел CO2-5, SN-FC-10023",
    category: "Въглероден диоксид",
    chargeMassKg: "5",
    extinguishingAgentType: "CO₂",
    extinguishingAgentTradeName: "",
    serviceType: "презареждане",
    serviceDate: "2026-04-12",
    servicePersonName: "Иван Петров",
    servicePersonSignatureDataUrl: "",
    stickerNumber: "ST-240184",
  },
  {
    id: "ext-4",
    rowNumber: "4",
    identificationMarking: "Пожарогасител ABC 9 kg, модел PG-9, SN-FC-10024",
    category: "Прахов",
    chargeMassKg: "9",
    extinguishingAgentType: "прах",
    extinguishingAgentTradeName: "ABC 40",
    serviceType: "техническо обслужване",
    serviceDate: "2026-04-12",
    servicePersonName: "Иван Петров",
    servicePersonSignatureDataUrl: "",
    stickerNumber: "ST-240185",
  },
  {
    id: "ext-5",
    rowNumber: "5",
    identificationMarking: "Пожарогасител воден 9 l, модел W-9, SN-FC-10025",
    category: "Воден",
    chargeMassKg: "9",
    extinguishingAgentType: "вода",
    extinguishingAgentTradeName: "",
    serviceType: "техническо обслужване",
    serviceDate: "2026-04-12",
    servicePersonName: "Иван Петров",
    servicePersonSignatureDataUrl: "",
    stickerNumber: "ST-240186",
  },
  {
    id: "ext-6",
    rowNumber: "6",
    identificationMarking: "Пожарогасител пяна 6 l, модел F-6, SN-FC-10026",
    category: "Пенен",
    chargeMassKg: "6",
    extinguishingAgentType: "пяна",
    extinguishingAgentTradeName: "AFFF",
    serviceType: "техническо обслужване",
    serviceDate: "2026-04-12",
    servicePersonName: "Иван Петров",
    servicePersonSignatureDataUrl: "",
    stickerNumber: "ST-240187",
  },
  {
    id: "ext-7",
    rowNumber: "7",
    identificationMarking: "Пожарогасител ABC 6 kg, модел PG-6, SN-FC-10027",
    category: "Прахов",
    chargeMassKg: "6",
    extinguishingAgentType: "прах",
    extinguishingAgentTradeName: "ABC 40",
    serviceType: "презареждане",
    serviceDate: "2026-04-12",
    servicePersonName: "Иван Петров",
    servicePersonSignatureDataUrl: "",
    stickerNumber: "ST-240188",
  },
  {
    id: "ext-8",
    rowNumber: "8",
    identificationMarking: "Пожарогасител CO₂ 5 kg, модел CO2-5, SN-FC-10028",
    category: "Въглероден диоксид",
    chargeMassKg: "5",
    extinguishingAgentType: "CO₂",
    extinguishingAgentTradeName: "",
    serviceType: "техническо обслужване",
    serviceDate: "2026-04-12",
    servicePersonName: "Иван Петров",
    servicePersonSignatureDataUrl: "",
    stickerNumber: "ST-240189",
  },
  {
    id: "ext-9",
    rowNumber: "9",
    identificationMarking: "Пожарогасител ABC 12 kg, модел PG-12, SN-FC-10029",
    category: "Прахов",
    chargeMassKg: "12",
    extinguishingAgentType: "прах",
    extinguishingAgentTradeName: "ABC 40",
    serviceType: "хидростатично изпитване на устойчивост на налягане",
    serviceDate: "2026-04-12",
    servicePersonName: "Иван Петров",
    servicePersonSignatureDataUrl: "",
    stickerNumber: "ST-240190",
  },
  {
    id: "ext-10",
    rowNumber: "10",
    identificationMarking: "Пожарогасител ABC 6 kg, модел PG-6, SN-FC-10030",
    category: "Прахов",
    chargeMassKg: "6",
    extinguishingAgentType: "прах",
    extinguishingAgentTradeName: "ABC 40",
    serviceType: "техническо обслужване",
    serviceDate: "2026-04-12",
    servicePersonName: "Иван Петров",
    servicePersonSignatureDataUrl: "",
    stickerNumber: "ST-240191",
  },
  {
    id: "ext-11",
    rowNumber: "11",
    identificationMarking: "Пожарогасител ABC 6 kg, модел PG-6, SN-FC-10031",
    category: "Прахов",
    chargeMassKg: "6",
    extinguishingAgentType: "прах",
    extinguishingAgentTradeName: "ABC 40",
    serviceType: "техническо обслужване",
    serviceDate: "2026-04-12",
    servicePersonName: "Иван Петров",
    servicePersonSignatureDataUrl: "",
    stickerNumber: "ST-240192",
  },
  {
    id: "ext-12",
    rowNumber: "12",
    identificationMarking: "Пожарогасител CO₂ 2 kg, модел CO2-2, SN-FC-10032",
    category: "Въглероден диоксид",
    chargeMassKg: "2",
    extinguishingAgentType: "CO₂",
    extinguishingAgentTradeName: "",
    serviceType: "техническо обслужване",
    serviceDate: "2026-04-12",
    servicePersonName: "Иван Петров",
    servicePersonSignatureDataUrl: "",
    stickerNumber: "ST-240193",
  },
];

function valueFromQuery(
  query: Record<string, string | string[] | undefined>,
  key: string,
  fallback: string
) {
  const value = query[key];
  if (Array.isArray(value)) {
    return value[0] ?? fallback;
  }

  return value ?? fallback;
}

function parseRows(value: string) {
  if (!value) return mockExtinguisherRows;

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return mockExtinguisherRows;

    return parsed as ExtinguisherProtocolRow[];
  } catch {
    return mockExtinguisherRows;
  }
}

type ExtinguisherHandoverPrintPageProps = {
  searchParams: SearchParams;
};

export default async function ExtinguisherHandoverPrintPage({
  searchParams,
}: ExtinguisherHandoverPrintPageProps) {
  const query = await searchParams;
  const protocolNumber = valueFromQuery(query, "protocolNumber", "PR-2026-0417");
  const date = valueFromQuery(query, "date", "2026-04-12");
  const client = valueFromQuery(query, "client", "\u0428\u0443\u043c\u0435\u043d \u0420\u0438\u0442\u0435\u0439\u043b \u0413\u0440\u0443\u043f \u0410\u0414");
  const address = valueFromQuery(query, "address", "\u0431\u0443\u043b. \u0421\u0438\u043c\u0435\u043e\u043d \u0412\u0435\u043b\u0438\u043a\u0438 46, 9700 \u0428\u0443\u043c\u0435\u043d");
  const region = valueFromQuery(query, "region", "\u0428\u0443\u043c\u0435\u043d");
  const phone = valueFromQuery(query, "phone", "0896 089 991");
  const technician = valueFromQuery(query, "technician", "\u0418\u0432\u0430\u043d \u041f\u0435\u0442\u0440\u043e\u0432");
  const contact = valueFromQuery(query, "contact", "\u041c\u0430\u0440\u0438\u044f \u0413\u0435\u043e\u0440\u0433\u0438\u0435\u0432\u0430");
  const previewId = valueFromQuery(query, "previewId", "");
  const embedded = valueFromQuery(query, "embedded", "") === "1";
  const rows = parseRows(valueFromQuery(query, "extinguishers", ""));
  const companyName = valueFromQuery(query, "companyName", "Пожарен Контрол ЕООД");
  const companyBulstat = valueFromQuery(query, "companyBulstat", "206 094 193");
  const companyAddress = valueFromQuery(
    query,
    "companyAddress",
    "гр. Шумен, ул. Владайско въстание 152"
  );
  const companyPhone = valueFromQuery(query, "companyPhone", "0896 089 991");

  return (
    <ExtinguisherPrintDocument
      protocolNumber={protocolNumber}
      date={date}
      client={client}
      address={address}
      region={region}
      phone={phone}
      technician={technician}
      contact={contact}
      previewId={previewId}
      embedded={embedded}
      initialRows={rows}
      companyName={companyName}
      companyBulstat={companyBulstat}
      companyAddress={companyAddress}
      companyPhone={companyPhone}
    />
  );
}
