export type GeocodedAddress = {
  latitude: number;
  longitude: number;
  displayName: string;
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
  const clean = address.trim();
  const cityMatch = clean.match(/(?:^|,\s*)(?:гр\.?|град)?\s*([А-ЯA-Z][^,0-9]+)/i);
  const streetMatch = clean.match(/(?:ул\.?|улица|бул\.?|булевард)?\s*([^,\d№]+?)\s*(?:№\s*)?(\d+[A-Za-zА-Яа-я]?)/i);
  const city = cityMatch?.[1]?.trim() ?? "";
  const street = streetMatch?.[1]?.trim() ?? "";
  const number = streetMatch?.[2]?.trim() ?? "";

  return {
    city: normalizeBulgarianAddress(city),
    street: normalizeBulgarianAddress(`${street} ${number}`),
  };
}

function addressQueries(address: string) {
  const query = address.trim();
  const normalized = normalizeBulgarianAddress(query);
  const parts = parseAddressParts(query);
  const structured = parts.city && parts.street ? `${parts.street}, ${parts.city}` : "";
  const latin = transliterateBg(normalized);
  const latinStructured = transliterateBg(structured);

  return uniqueValues([
    query,
    `${query}, България`,
    normalized,
    `${normalized}, България`,
    structured,
    `${structured}, България`,
    latin,
    `${latin}, Bulgaria`,
    latinStructured,
    `${latinStructured}, Bulgaria`,
    query.replace(/№/g, "").replace(/\s+/g, " "),
    `${query.replace(/№/g, "").replace(/\s+/g, " ")}, Bulgaria`,
  ]);
}

async function requestNominatim(query: string): Promise<GeocodedAddress | null> {
  const params = new URLSearchParams({
    format: "jsonv2",
    limit: "1",
    countrycodes: "bg",
    addressdetails: "1",
    q: query,
  });

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?${params.toString()}`,
    {
      headers: {
        Accept: "application/json",
      },
    }
  );

  if (!response.ok) {
    throw new Error("Адресът не можа да бъде проверен в картната услуга.");
  }

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

async function requestNominatimStructured(address: string): Promise<GeocodedAddress | null> {
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

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?${params.toString()}`,
    {
      headers: {
        Accept: "application/json",
      },
    }
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

async function requestPhoton(query: string): Promise<GeocodedAddress | null> {
  const params = new URLSearchParams({
    q: query,
    limit: "1",
    lang: "bg",
    osm_tag: "!place:country",
  });

  const response = await fetch(`https://photon.komoot.io/api/?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });

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
  address: string
): Promise<GeocodedAddress | null> {
  const queries = addressQueries(address);
  if (!queries.length) return null;

  const structured = await requestNominatimStructured(address);
  if (structured) return structured;

  for (const query of queries) {
    const result = await requestNominatim(query);
    if (result) return result;
  }

  for (const query of queries) {
    const result = await requestPhoton(query);
    if (result) return result;
  }

  return null;
}
