"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowLeft,
  Building2,
  MapPin,
  Plus,
  QrCode,
  RefreshCw,
  Save,
  UserRound,
} from "lucide-react";
import { AppShell } from "../../../components/app-shell";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { PageHeader } from "../../../components/ui/page-header";
import { geocodeAddress } from "../../../lib/geocoding";
import {
  defaultProtocolSettings,
  readProtocolSettings,
  readProtocolSettingsFromSupabase,
  writeProtocolSettingsToSupabase,
  type ProtocolSettings,
} from "../../../lib/settings";
import { createSupabaseBrowserClient } from "../../../lib/supabase/client";

type DataRecord = Record<string, unknown>;

type ClientOption = {
  id: string;
  name: string;
  bulstat: string;
};

type LocationFormState = {
  clientId: string;
  objectType: string;
  name: string;
  address: string;
  region: string;
  qrCode: string;
};

const emptyForm: LocationFormState = {
  clientId: "",
  objectType: "",
  name: "",
  address: "",
  region: "",
  qrCode: "",
};

function textValue(record: DataRecord | null | undefined, keys: string[]) {
  if (!record) return "";

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }

  return "";
}

function createQrCode() {
  return `OBJ-${Date.now().toString().slice(-6)}`;
}

function uniqueValues(values: string[]) {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter((value) => {
      const key = value.toLowerCase();
      if (!value || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function objectTypeOptions(settings: ProtocolSettings, selectedValue = "") {
  return uniqueValues([
    ...(settings.objectTypes?.length
      ? settings.objectTypes
      : defaultProtocolSettings.objectTypes),
    selectedValue,
  ]).filter((value) => value !== "Друг" || selectedValue === "Друг");
}

const ADD_OBJECT_TYPE_VALUE = "__add_object_type__";

function FormField({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-black uppercase text-slate-400">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs font-bold text-slate-400">{hint}</p> : null}
    </div>
  );
}

function locationColumnError(error: Error) {
  if (
    error.message.includes("latitude") ||
    error.message.includes("longitude") ||
    error.message.includes("geocoded_")
  ) {
    return "Липсват координатните колони в Supabase. Пуснете обновения sql/database_first_storage.sql и опитайте отново.";
  }

  return error.message;
}

function NewLocationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preferredClientId = (searchParams.get("clientId") || "").trim();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [form, setForm] = useState<LocationFormState>(emptyForm);
  const [protocolSettings, setProtocolSettings] = useState<ProtocolSettings>(
    defaultProtocolSettings
  );
  const [addingObjectType, setAddingObjectType] = useState(false);
  const [newObjectType, setNewObjectType] = useState("");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [saveState, setSaveState] = useState<
    "idle" | "geocoding" | "saving" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === form.clientId) ?? null,
    [clients, form.clientId]
  );
  const availableObjectTypes = useMemo(
    () => objectTypeOptions(protocolSettings, form.objectType),
    [protocolSettings, form.objectType]
  );

  function updateForm(key: keyof LocationFormState, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function addObjectType() {
    const value = newObjectType.trim();
    if (!value) return;

    const nextSettings = {
      ...protocolSettings,
      objectTypes: uniqueValues([...(protocolSettings.objectTypes ?? []), value]),
    };

    try {
      await writeProtocolSettingsToSupabase(nextSettings);
      setProtocolSettings(nextSettings);
      updateForm("objectType", value);
      setNewObjectType("");
      setAddingObjectType(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Грешка при запис на типа обект"
      );
    }
  }

  const loadOptions = useCallback(async function loadOptions() {
    setLoadState("loading");
    setErrorMessage("");

    try {
      const supabase = createSupabaseBrowserClient();
      const { data: clientsData, error: clientsError } = await supabase
        .from("clients")
        .select("*")
        .order("name", { ascending: true });

      if (clientsError) {
        setErrorMessage(clientsError.message || "Грешка при зареждане");
        setLoadState("error");
        return;
      }

      const mappedClients = ((clientsData as DataRecord[]) ?? []).map(
        (client) => ({
          id: textValue(client, ["id"]),
          name: textValue(client, ["name", "organization", "company_name"]),
          bulstat: textValue(client, ["bulstat", "eik", "vat_number"]),
        })
      );
      const localSettings = readProtocolSettings();
      setProtocolSettings(localSettings);

      try {
        const dbSettings = await readProtocolSettingsFromSupabase();
        setProtocolSettings(dbSettings);
      } catch {
        setProtocolSettings(localSettings);
      }

      setClients(mappedClients);
      setForm((current) => ({
        ...current,
        clientId:
          preferredClientId &&
          mappedClients.some((client) => client.id === preferredClientId)
            ? preferredClientId
            : current.clientId &&
                mappedClients.some((client) => client.id === current.clientId)
              ? current.clientId
              : mappedClients[0]?.id ?? "",
      }));
      setLoadState("ready");
    } catch {
      setErrorMessage("Грешка при връзка със Supabase");
      setLoadState("error");
    }
  }, [preferredClientId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadOptions();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadOptions]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.clientId || !form.name.trim()) return;

    setErrorMessage("");

    try {
      const supabase = createSupabaseBrowserClient();
      const qrCode = form.qrCode.trim() || createQrCode();
      const address = form.address.trim();

      setSaveState(address ? "geocoding" : "saving");
      const geocoded = address ? await geocodeAddress(address) : null;

      if (address && !geocoded) {
        throw new Error(
          "Адресът не беше намерен на картата. Добавете град, улица и номер и опитайте отново."
        );
      }

      setSaveState("saving");
      const { data: locationRow, error: locationError } = await supabase
        .from("locations")
        .insert({
          client_id: form.clientId,
          object_type: form.objectType.trim(),
          qr_code: qrCode,
          name: form.name.trim(),
          address,
          region: "",
          status: "изряден",
          latitude: geocoded?.latitude ?? null,
          longitude: geocoded?.longitude ?? null,
          geocoded_address: geocoded?.displayName ?? null,
          geocoded_at: geocoded ? new Date().toISOString() : null,
        })
        .select("*")
        .single();

      if (locationError || !locationRow) {
        throw new Error(locationError?.message || "Обектът не беше записан");
      }

      router.push(`/locations/${qrCode}`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? locationColumnError(error)
          : "Грешка при запис към Supabase"
      );
      setSaveState("error");
    }
  }

  const isSaving = saveState === "saving" || saveState === "geocoding";

  return (
    <AppShell
      title="Обекти"
      description="Създаване на нов обект с клиент, адрес, координати и QR код"
    >
      <PageHeader
        title="Нов обект"
        description="Адресът се проверява на реална карта и координатите се записват в Supabase."
        actions={
          <Link
            href="/locations"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
          >
            <ArrowLeft size={17} />
            Назад
          </Link>
        }
      />

      <form
        onSubmit={handleSubmit}
        className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]"
      >
        <div className="space-y-6">
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                <Building2 size={20} />
              </div>
              <div>
                <h2 className="text-lg font-black">Основни данни</h2>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  Име, клиент и адрес на обекта.
                </p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <FormField label="Име на обект">
                <Input
                  required
                  value={form.name}
                  onChange={(event) => updateForm("name", event.target.value)}
                  placeholder="Напр. Склад Север"
                  className="w-full"
                />
              </FormField>

              <FormField
                label="Клиент"
                hint={
                  clients.length
                    ? undefined
                    : "Първо добавете клиент, за да свържете обекта."
                }
              >
                <select
                  required
                  value={form.clientId}
                  onChange={(event) =>
                    updateForm("clientId", event.target.value)
                  }
                  disabled={loadState === "loading" || clients.length === 0}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 shadow-sm transition focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100 disabled:opacity-60"
                >
                  <option value="">Изберете клиент</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label="Тип обект">
                <div className="flex gap-2">
                  <select
                    value={form.objectType}
                    onChange={(event) => {
                      if (event.target.value === ADD_OBJECT_TYPE_VALUE) {
                        setAddingObjectType(true);
                        updateForm("objectType", "");
                        return;
                      }
                      setAddingObjectType(false);
                      updateForm("objectType", event.target.value);
                    }}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 shadow-sm transition focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
                  >
                    <option value="">Изберете тип</option>
                    {availableObjectTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                    <option value={ADD_OBJECT_TYPE_VALUE}>Добави +</option>
                  </select>
                </div>
                {addingObjectType ? (
                  <div className="mt-2 flex gap-2">
                    <Input
                      value={newObjectType}
                      onChange={(event) => setNewObjectType(event.target.value)}
                      placeholder="Нов тип обект"
                      className="w-full"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={addObjectType}
                      disabled={!newObjectType.trim()}
                    >
                      Добави
                    </Button>
                  </div>
                ) : null}
              </FormField>

              <div className="lg:col-span-2">
                <FormField
                  label="Адрес"
                  hint="За точна позиция въведете град, улица и номер. Например: гр. Шумен, бул. Симеон Велики 46."
                >
                  <Input
                    value={form.address}
                    onChange={(event) =>
                      updateForm("address", event.target.value)
                    }
                    placeholder="град, улица, номер..."
                    className="w-full"
                  />
                </FormField>
              </div>

              <FormField
                label="QR код"
                hint="Ако го оставите празен, системата ще генерира код при запис."
              >
                <div className="flex gap-2">
                  <Input
                    value={form.qrCode}
                    onChange={(event) =>
                      updateForm("qrCode", event.target.value)
                    }
                    placeholder="OBJ-000001"
                    className="w-full"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Генерирай QR код"
                    onClick={() => updateForm("qrCode", createQrCode())}
                  >
                    <QrCode size={17} />
                  </Button>
                </div>
              </FormField>
            </div>
          </Card>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <Card className="p-5">
            <div className="flex items-center gap-2 text-sm font-black text-slate-800">
              <UserRound size={17} />
              Избран клиент
            </div>
            <div className="mt-4 rounded-2xl bg-slate-50 p-4">
              <div className="font-black text-slate-900">
                {selectedClient?.name || "Няма избран клиент"}
              </div>
              <div className="mt-1 text-sm font-bold text-slate-500">
                {selectedClient?.bulstat || "ЕИК / БУЛСТАТ не е попълнен"}
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 text-sm font-black text-slate-800">
              <MapPin size={17} />
              Позиция на картата
            </div>
            <p className="mt-3 text-sm font-medium text-slate-500">
              При запис адресът ще бъде намерен чрез OpenStreetMap и
              координатите ще се пазят към обекта.
            </p>

            {errorMessage ? (
              <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">
                {errorMessage}
              </div>
            ) : null}

            <div className="mt-5 flex flex-col gap-2">
              <Button
                type="submit"
                disabled={
                  isSaving ||
                  loadState === "loading" ||
                  !form.clientId ||
                  !form.name.trim()
                }
                className="w-full"
              >
                {isSaving ? (
                  <RefreshCw size={17} className="animate-spin" />
                ) : (
                  <Save size={17} />
                )}
                {saveState === "geocoding"
                  ? "Проверка на адрес..."
                  : saveState === "saving"
                    ? "Записване..."
                    : "Запази обект"}
              </Button>

              {clients.length === 0 && loadState !== "loading" ? (
                <Link
                  href="/clients"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-5 text-sm font-black text-orange-700 transition hover:bg-orange-100"
                >
                  <Plus size={17} />
                  Добави клиент
                </Link>
              ) : null}

              {loadState === "error" ? (
                <Button type="button" variant="outline" onClick={loadOptions}>
                  <RefreshCw size={17} />
                  Опитай пак
                </Button>
              ) : null}
            </div>
          </Card>
        </aside>
      </form>
    </AppShell>
  );
}

export default function NewLocationPage() {
  return (
    <Suspense fallback={null}>
      <NewLocationContent />
    </Suspense>
  );
}
