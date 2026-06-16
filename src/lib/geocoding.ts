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

export async function geocodeAddress(
  address: string
): Promise<GeocodedAddress | null> {
  const query = address.trim();
  if (!query) return null;

  const params = new URLSearchParams({
    format: "jsonv2",
    limit: "1",
    countrycodes: "bg",
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
