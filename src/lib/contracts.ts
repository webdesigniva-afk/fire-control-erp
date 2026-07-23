export type ContractLifecycleStatus = "draft" | "accepted" | "terminated";

export type ContractLifecycleState = {
  status: ContractLifecycleStatus;
  label: "Чернова" | "Приет" | "Прекратен";
  variant: "neutral" | "success" | "danger";
};

type DataRecord = Record<string, unknown>;

function isRecord(value: unknown): value is DataRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function textValue(record: DataRecord | null | undefined, keys: string[]) {
  if (!record) return "";

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }

  return "";
}

function normalizedStatus(value: string) {
  return value.trim().toLowerCase();
}

function hasAnyText(record: DataRecord, keys: string[]) {
  return keys.some((key) => textValue(record, [key]));
}

export function contractLifecycleFromPayload(payload: unknown): ContractLifecycleState {
  const payloadRecord = isRecord(payload) ? payload : {};
  const contract = isRecord(payloadRecord.contract) ? payloadRecord.contract : {};
  const signature = isRecord(payloadRecord.signature) ? payloadRecord.signature : {};

  const statusValues = [
    textValue(payloadRecord, ["status"]),
    textValue(contract, ["status"]),
  ].map(normalizedStatus);

  const terminatedAt =
    textValue(payloadRecord, ["terminatedAt", "terminated_at"]) ||
    textValue(contract, ["terminatedAt", "terminated_at"]);

  if (terminatedAt || statusValues.includes("terminated")) {
    return { status: "terminated", label: "Прекратен", variant: "danger" };
  }

  const signatureStatus = normalizedStatus(textValue(signature, ["status"]));
  const hasSignedState =
    statusValues.some((status) => ["accepted", "signed", "active"].includes(status)) ||
    signatureStatus === "signed";

  const hasCompanySignature = hasAnyText(contract, [
    "contractorSignatureUrl",
    "contractor_signature_url",
    "companySignatureUrl",
    "company_signature_url",
    "signatureUrl",
    "signature_url",
  ]);
  const hasClientSignature = hasAnyText(contract, [
    "clientSignatureUrl",
    "client_signature_url",
    "acceptedSignatureUrl",
    "accepted_signature_url",
  ]);

  if (hasSignedState || (hasCompanySignature && hasClientSignature)) {
    return { status: "accepted", label: "Приет", variant: "success" };
  }

  return { status: "draft", label: "Чернова", variant: "neutral" };
}
