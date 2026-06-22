import {
  geocodeAddress,
  type GeocodeOptions,
} from "../../../lib/geocoding";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      address?: unknown;
      options?: GeocodeOptions;
    };
    const address = typeof body.address === "string" ? body.address.trim() : "";

    if (!address) {
      return Response.json({ result: null });
    }

    const result = await geocodeAddress(address, body.options ?? {});
    return Response.json({ result });
  } catch {
    return Response.json({ result: null }, { status: 200 });
  }
}
