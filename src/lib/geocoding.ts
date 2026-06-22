export type GeocodedAddress = {
  latitude: number;
  longitude: number;
  displayName: string;
  precision?: "exact" | "approximate";
};

type NominatimResult = {
  lat?: string;
  lon?: string;
  display_name?: string;
};

type PhotonFeature = {
  geometry?: {
    coordinates?: [number, number];
  };
  properties?: {
    name?: string;
    street?: string;
    city?: string;
    country?: string;
  };
};

type PhotonResult = {
  features?: PhotonFeature[];
};

type GeocodeOptions = {
  maxQueries?: number;
  nominatimQueryLimit?: number;
  requestTimeoutMs?: number;
};

export type { GeocodeOptions };

const NOMINATIM_HEADERS = {
  Accept: "application/json",
  "Accept-Language": "bg,en;q=0.8",
  // Nominatim rejects anonymous programmatic requests. This may be replaced
  // with a contactable identifier in the server environment when deployed.
  "User-Agent":
    process.env.GEOCODING_USER_AGENT ??
    "FireControlCRM/1.0 (address-geocoding)",
};

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
) {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    globalThis.clearTimeout(timeout);
  }
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

function normalizeBulgarianAddress(address: string) {
  return address
    .replace(/\bгр\.\s*/gi, "")
    .replace(/\bград\s+/gi, "")
    .replace(/\bул\.\s*/gi, "")
    .replace(/\bулица\s+/gi, "")
    .replace(/\bбул\.\s*/gi, "")
    .replace(/\bбулевард\s+/gi, "")
    .replace(/№/g, " ")
    .replace(/No\.?/gi, " ")
    .replace(/[„“"]/g, "")
    .replace(/\b(?:вх\.?|вход|ет\.?|етаж|ап\.?|апартамент|офис)\s*[A-Za-zА-Яа-я0-9-]+/gi, "")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .trim();
}

function transliterateBg(value: string) {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sht", ъ: "a", ь: "y", ю: "yu", я: "ya",
  };

  return value
    .split("")
    .map((char) => {
      const lower = char.toLowerCase();
      const latin = map[lower];
      if (!latin) return char;
      return char === lower ? latin : latin.charAt(0).toUpperCase() + latin.slice(1);
    })
    .join("");
}

function parseAddressParts(address: string) {
  const clean = normalizeBulgarianAddress(address);
  const rawParts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const normalizedParts = rawParts.map(normalizeBulgarianAddress).filter(Boolean);
  const cityPart =
    rawParts.find((part) => /\b(?:гр\.?|град)\s+/i.test(part)) ??
    normalizedParts.find((part) => !/\d/.test(part) && part.length <= 40) ??
    normalizedParts[0] ??
    "";
  const streetPart =
    rawParts.find((part) => /\b(?:ул\.?|улица|бул\.?|булевард)\s+/i.test(part)) ??
    normalizedParts.find((part) => /\d/.test(part)) ??
    "";
  const streetMatch = streetPart.match(/(.+?)\s*(?:№\s*)?(\d+[A-Za-zА-Яа-я]?)(?:\b|$)/i);
  const fallbackStreetMatch = address.match(
    /(?:ул\.?|улица|бул\.?|булевард)?\s*([^,\d№]+?)\s*(?:№\s*)?(\d+[A-Za-zА-Яа-я]?)(?:\b|$)/i
  );
  const street = streetMatch?.[1]?.trim() || fallbackStreetMatch?.[1]?.trim() || streetPart;
  const number = streetMatch?.[2]?.trim() || fallbackStreetMatch?.[2]?.trim() || "";

  const city = normalizeBulgarianAddress(cityPart)
    .replace(/\s+(?:център|center)$/i, "")
    .trim();

  return {
    city,
    street: normalizeBulgarianAddress(`${street} ${number}`),
    streetName: normalizeBulgarianAddress(street),
    number,
    normalized: clean,
  };
}

function addressQueries(address: string) {
  const query = address.trim();
  const normalized = normalizeBulgarianAddress(query);
  const parts = parseAddressParts(query);
  const structured = parts.city && parts.street ? `${parts.street}, ${parts.city}` : "";
  const streetOnly = parts.city && parts.streetName ? `${parts.streetName}, ${parts.city}` : "";
  const reversedStructured = parts.city && parts.street ? `${parts.city}, ${parts.street}` : "";
  const numberFirst =
    parts.city && parts.streetName && parts.number
      ? `${parts.number} ${parts.streetName}, ${parts.city}`
      : "";
  const latin = transliterateBg(normalized);
  const latinStructured = transliterateBg(structured);
  const latinStreetOnly = transliterateBg(streetOnly);
  const latinNumberFirst = transliterateBg(numberFirst);

  return uniqueValues([
    structured,
    `${structured}, България`,
    reversedStructured,
    `${reversedStructured}, България`,
    query,
    `${query}, България`,
    normalized,
    `${normalized}, България`,
    numberFirst,
    `${numberFirst}, България`,
    streetOnly,
    `${streetOnly}, България`,
    latin,
    `${latin}, Bulgaria`,
    latinStructured,
    `${latinStructured}, Bulgaria`,
    latinNumberFirst,
    `${latinNumberFirst}, Bulgaria`,
    latinStreetOnly,
    `${latinStreetOnly}, Bulgaria`,
    query.replace(/№/g, "").replace(/\s+/g, " "),
    `${query.replace(/№/g, "").replace(/\s+/g, " ")}, Bulgaria`,
  ]);
}

async function requestNominatim(
  query: string,
  timeoutMs: number
): Promise<GeocodedAddress | null> {
  const params = new URLSearchParams({
    format: "jsonv2",
    limit: "1",
    countrycodes: "bg",
    addressdetails: "1",
    q: query,
  });

  const response = await fetchWithTimeout(
    `https://nominatim.openstreetmap.org/search?${params.toString()}`,
    {
      headers: NOMINATIM_HEADERS,
      cache: "no-store",
    },
    timeoutMs
  );

  if (!response.ok) return null;

  const results = (await response.json()) as NominatimResult[];
  const first = results[0];
  if (!first?.lat || !first.lon) return null;

  const latitude = Number(first.lat);
  const longitude = Number(first.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return {
    latitude,
    longitude,
    displayName: first.display_name ?? query,
  };
}

async function requestNominatimStructured(
  address: string,
  timeoutMs: number
): Promise<GeocodedAddress | null> {
  const parts = parseAddressParts(address);
  if (!parts.city || !parts.street) return null;

  const params = new URLSearchParams({
    format: "jsonv2",
    limit: "1",
    countrycodes: "bg",
    addressdetails: "1",
    street: parts.street,
    city: parts.city,
    country: "България",
  });

  const response = await fetchWithTimeout(
    `https://nominatim.openstreetmap.org/search?${params.toString()}`,
    {
      headers: NOMINATIM_HEADERS,
      cache: "no-store",
    },
    timeoutMs
  );

  if (!response.ok) return null;

  const results = (await response.json()) as NominatimResult[];
  const first = results[0];
  if (!first?.lat || !first.lon) return null;

  const latitude = Number(first.lat);
  const longitude = Number(first.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return {
    latitude,
    longitude,
    displayName: first.display_name ?? `${parts.street}, ${parts.city}`,
  };
}

async function requestPhoton(
  query: string,
  timeoutMs: number
): Promise<GeocodedAddress | null> {
  const params = new URLSearchParams({
    q: query,
    limit: "1",
    lang: "bg",
    osm_tag: "!place:country",
  });

  const response = await fetchWithTimeout(
    `https://photon.komoot.io/api/?${params.toString()}`,
    {
      headers: { Accept: "application/json" },
    },
    timeoutMs
  );

  if (!response.ok) return null;

  const result = (await response.json()) as PhotonResult;
  const first = result.features?.[0];
  const coordinates = first?.geometry?.coordinates;
  if (!coordinates) return null;

  const [longitude, latitude] = coordinates;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return {
    latitude,
    longitude,
    displayName: [
      first.properties?.name || first.properties?.street,
      first.properties?.city,
      first.properties?.country,
    ].filter(Boolean).join(", ") || query,
  };
}

export async function geocodeAddress(
  address: string,
  options: GeocodeOptions = {}
): Promise<GeocodedAddress | null> {
  if (typeof window !== "undefined") {
    const response = await fetch("/api/geocode", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ address, options }),
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as {
      result?: GeocodedAddress | null;
    };

    return payload.result ?? null;
  }

  const requestTimeoutMs = options.requestTimeoutMs ?? 2500;
  const nominatimQueryLimit = options.nominatimQueryLimit ?? 2;
  const queries = addressQueries(address).slice(0, options.maxQueries);
  if (!queries.length) return null;

  for (const query of queries.slice(0, nominatimQueryLimit)) {
    const result = await requestNominatim(query, requestTimeoutMs).catch(
      () => null
    );
    if (result) return result;
  }

  const structured = await requestNominatimStructured(
    address,
    requestTimeoutMs
  ).catch(() => null);
  if (structured) return structured;

  const photonResult = await requestPhoton(queries[0], requestTimeoutMs).catch(
    () => null
  );
  if (photonResult) return photonResult;

  return null;
}
