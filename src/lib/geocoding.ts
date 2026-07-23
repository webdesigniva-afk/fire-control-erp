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
    housenumber?: string;
    city?: string;
    country?: string;
  };
};

type PhotonResult = {
  features?: PhotonFeature[];
};

type GoogleGeocodeResult = {
  formatted_address?: string;
  geometry?: {
    location?: {
      lat?: number;
      lng?: number;
    };
    location_type?: string;
  };
};

type GoogleGeocodeResponse = {
  results?: GoogleGeocodeResult[];
  status?: string;
};

type GeocodeOptions = {
  maxQueries?: number;
  nominatimQueryLimit?: number;
  requestTimeoutMs?: number;
};

export type { GeocodeOptions };

const BULGARIA = "\u0411\u044a\u043b\u0433\u0430\u0440\u0438\u044f";

const NOMINATIM_HEADERS = {
  Accept: "application/json",
  "Accept-Language": "bg,en;q=0.8",
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
    .replace(/\b(?:\u0433\u0440|gr)\.\s*/giu, "")
    .replace(/\b\u0433\u0440\u0430\u0434\s+/giu, "")
    .replace(/\b(?:\u0443\u043b|ul)\.\s*/giu, "")
    .replace(/\b\u0443\u043b\u0438\u0446\u0430\s+/giu, "")
    .replace(/\b(?:\u0431\u0443\u043b|bul)\.\s*/giu, "")
    .replace(/\b\u0431\u0443\u043b\u0435\u0432\u0430\u0440\u0434\s+/giu, "")
    .replace(/[№#]/g, " ")
    .replace(/No\.?/giu, " ")
    .replace(/[„“"]/g, "")
    .replace(/\b(?:\u0432\u0445\.?|\u0432\u0445\u043e\u0434|\u0435\u0442\.?|\u0435\u0442\u0430\u0436|\u0430\u043f\.?|\u0430\u043f\u0430\u0440\u0442\u0430\u043c\u0435\u043d\u0442|\u043e\u0444\u0438\u0441)\s*[\w\u0400-\u04FF-]+/giu, "")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .trim();
}

function transliterateBg(value: string) {
  const map: Record<string, string> = {
    "\u0430": "a",
    "\u0431": "b",
    "\u0432": "v",
    "\u0433": "g",
    "\u0434": "d",
    "\u0435": "e",
    "\u0436": "zh",
    "\u0437": "z",
    "\u0438": "i",
    "\u0439": "y",
    "\u043a": "k",
    "\u043b": "l",
    "\u043c": "m",
    "\u043d": "n",
    "\u043e": "o",
    "\u043f": "p",
    "\u0440": "r",
    "\u0441": "s",
    "\u0442": "t",
    "\u0443": "u",
    "\u0444": "f",
    "\u0445": "h",
    "\u0446": "ts",
    "\u0447": "ch",
    "\u0448": "sh",
    "\u0449": "sht",
    "\u044a": "a",
    "\u044c": "y",
    "\u044e": "yu",
    "\u044f": "ya",
  };

  return value
    .split("")
    .map((char) => {
      const lower = char.toLowerCase();
      const latin = map[lower];
      if (!latin) return char;
      return char === lower
        ? latin
        : latin.charAt(0).toUpperCase() + latin.slice(1);
    })
    .join("");
}

function parseAddressParts(address: string) {
  const clean = normalizeBulgarianAddress(address);
  const rawParts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const normalizedParts = rawParts
    .map(normalizeBulgarianAddress)
    .filter(Boolean);
  const cityPart =
    rawParts.find((part) => /\b(?:\u0433\u0440\.?|\u0433\u0440\u0430\u0434)\s+/iu.test(part)) ??
    normalizedParts.find((part) => !/\d/.test(part) && part.length <= 40) ??
    normalizedParts[0] ??
    "";
  const streetPart =
    rawParts.find((part) => /\b(?:\u0443\u043b\.?|\u0443\u043b\u0438\u0446\u0430|\u0431\u0443\u043b\.?|\u0431\u0443\u043b\u0435\u0432\u0430\u0440\u0434)\s+/iu.test(part)) ??
    normalizedParts.find((part) => /\d/.test(part)) ??
    "";
  const streetMatch = streetPart.match(/(.+?)\s*(?:№\s*)?(\d+[\w\u0400-\u04FF-]?)(?:\b|$)/iu);
  const fallbackStreetMatch = address.match(
    /(?:\u0443\u043b\.?|\u0443\u043b\u0438\u0446\u0430|\u0431\u0443\u043b\.?|\u0431\u0443\u043b\u0435\u0432\u0430\u0440\u0434)?\s*([^,\d№]+?)\s*(?:№\s*)?(\d+[\w\u0400-\u04FF-]?)(?:\b|$)/iu
  );
  const street =
    streetMatch?.[1]?.trim() ||
    fallbackStreetMatch?.[1]?.trim() ||
    streetPart;
  const number =
    streetMatch?.[2]?.trim() || fallbackStreetMatch?.[2]?.trim() || "";

  const city = normalizeBulgarianAddress(cityPart)
    .replace(/\s+(?:\u0446\u0435\u043d\u0442\u044a\u0440|center)$/iu, "")
    .trim();

  return {
    city,
    street: normalizeBulgarianAddress(`${street} ${number}`),
    streetName: normalizeBulgarianAddress(street),
    number,
    normalized: clean,
  };
}

function addressHasHouseNumber(value: string) {
  return /(?:^|[\s,№#])\d+[\w\u0400-\u04FF-]?(?:\b|$)/iu.test(value);
}

function resultLooksSpecific(query: string, result: GeocodedAddress) {
  if (!addressHasHouseNumber(query)) return true;

  const queryNumber = query.match(/(?:^|[\s,№#])(\d+[\w\u0400-\u04FF-]?)(?:\b|$)/iu)?.[1];
  if (!queryNumber) return true;

  return result.displayName.toLowerCase().includes(queryNumber.toLowerCase());
}

function addressQueries(address: string) {
  const query = address.trim();
  const normalized = normalizeBulgarianAddress(query);
  const parts = parseAddressParts(query);
  const structured =
    parts.city && parts.street ? `${parts.street}, ${parts.city}` : "";
  const streetOnly =
    parts.city && parts.streetName ? `${parts.streetName}, ${parts.city}` : "";
  const reversedStructured =
    parts.city && parts.street ? `${parts.city}, ${parts.street}` : "";
  const numberFirst =
    parts.city && parts.streetName && parts.number
      ? `${parts.number} ${parts.streetName}, ${parts.city}`
      : "";
  const latin = transliterateBg(normalized);
  const latinStructured = transliterateBg(structured);
  const latinStreetOnly = transliterateBg(streetOnly);
  const latinNumberFirst = transliterateBg(numberFirst);
  const withoutNumberSymbol = query.replace(/[№#]/g, " ").replace(/\s+/g, " ");

  return uniqueValues([
    structured,
    `${structured}, ${BULGARIA}`,
    reversedStructured,
    `${reversedStructured}, ${BULGARIA}`,
    query,
    `${query}, ${BULGARIA}`,
    normalized,
    `${normalized}, ${BULGARIA}`,
    numberFirst,
    `${numberFirst}, ${BULGARIA}`,
    streetOnly,
    `${streetOnly}, ${BULGARIA}`,
    latin,
    `${latin}, Bulgaria`,
    latinStructured,
    `${latinStructured}, Bulgaria`,
    latinNumberFirst,
    `${latinNumberFirst}, Bulgaria`,
    latinStreetOnly,
    `${latinStreetOnly}, Bulgaria`,
    withoutNumberSymbol,
    `${withoutNumberSymbol}, Bulgaria`,
  ]);
}

function geocodedResult(
  latitude: number,
  longitude: number,
  displayName: string
): GeocodedAddress | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (
    latitude < 41.0 ||
    latitude > 44.5 ||
    longitude < 22.0 ||
    longitude > 29.0
  ) {
    return null;
  }

  return {
    latitude,
    longitude,
    displayName,
    precision: "exact",
  };
}

function googleGeocodingKey() {
  return (
    process.env.GOOGLE_GEOCODING_API_KEY ||
    process.env.GOOGLE_MAPS_GEOCODING_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    ""
  ).trim();
}

async function requestGoogleGeocode(
  address: string,
  timeoutMs: number
): Promise<GeocodedAddress | null> {
  const apiKey = googleGeocodingKey();
  if (!apiKey) return null;

  const params = new URLSearchParams({
    address,
    components: "country:BG",
    language: "bg",
    region: "bg",
    key: apiKey,
  });

  const response = await fetchWithTimeout(
    `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`,
    {
      headers: { Accept: "application/json" },
      cache: "no-store",
    },
    timeoutMs
  );

  if (!response.ok) return null;

  const payload = (await response.json()) as GoogleGeocodeResponse;
  const result = payload.results?.find(
    (item) => item.geometry?.location_type === "ROOFTOP"
  );
  const location = result?.geometry?.location;
  if (!location) return null;

  return geocodedResult(
    Number(location.lat),
    Number(location.lng),
    result.formatted_address || address
  );
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

  const result = geocodedResult(
    Number(first.lat),
    Number(first.lon),
    first.display_name ?? query
  );
  return result && resultLooksSpecific(query, result) ? result : null;
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
    country: BULGARIA,
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

  const result = geocodedResult(
    Number(first.lat),
    Number(first.lon),
    first.display_name ?? `${parts.street}, ${parts.city}`
  );
  return result && resultLooksSpecific(parts.street, result) ? result : null;
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

  const payload = (await response.json()) as PhotonResult;
  const first = payload.features?.[0];
  const coordinates = first?.geometry?.coordinates;
  if (!coordinates) return null;

  const [longitude, latitude] = coordinates;
  const displayName =
    [
      first.properties?.street || first.properties?.name,
      first.properties?.housenumber,
      first.properties?.city,
      first.properties?.country,
    ]
      .filter(Boolean)
      .join(", ") || query;
  const result = geocodedResult(latitude, longitude, displayName);
  return result && resultLooksSpecific(query, result) ? result : null;
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
  const nominatimQueryLimit = options.nominatimQueryLimit ?? 4;
  const queries = addressQueries(address).slice(0, options.maxQueries);
  if (!queries.length) return null;

  const googleResult = await requestGoogleGeocode(
    address,
    Math.max(requestTimeoutMs, 3500)
  ).catch(() => null);
  if (googleResult) return googleResult;

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

  for (const query of queries) {
    const photonResult = await requestPhoton(query, requestTimeoutMs).catch(
      () => null
    );
    if (photonResult) return photonResult;
  }

  return null;
}
