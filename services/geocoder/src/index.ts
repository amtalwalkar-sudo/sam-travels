export type GeoapifyProxyEnv = {
  GEOAPIFY_API_KEY: string;
  ALLOWED_ORIGINS: string;
  RATE_LIMITER: { limit(input: { key: string }): Promise<{ success: boolean }> };
};

type ReverseRequest = { latitude?: unknown; longitude?: unknown };

function response(body: unknown, status: number, origin: string, allowed: boolean): Response {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  });
  if (allowed && origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    headers.set("Access-Control-Max-Age", "86400");
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function localityLabel(properties: Record<string, unknown>): string | undefined {
  const parts = [
    properties.suburb,
    properties.neighbourhood,
    properties.district,
    properties.city,
    properties.town,
    properties.village,
    properties.municipality,
    properties.county,
    properties.state,
    properties.country,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  const unique = [...new Set(parts.map(value => value.trim()))];
  return unique.length ? unique.join(", ") : undefined;
}

export default {
  async fetch(request: Request, env: GeoapifyProxyEnv): Promise<Response> {
    const origin = request.headers.get("Origin") ?? "";
    const allowedOrigins = (env.ALLOWED_ORIGINS ?? "").split(",").map(value => value.trim()).filter(Boolean);
    const originAllowed = !!origin && allowedOrigins.includes(origin);

    if (request.method === "OPTIONS") {
      return originAllowed
        ? response({}, 204, origin, true)
        : response({ error: "origin_not_allowed" }, 403, "", false);
    }
    if (!originAllowed) return response({ error: "origin_not_allowed" }, 403, "", false);
    if (new URL(request.url).pathname !== "/reverse-geocode" || request.method !== "POST") {
      return response({ error: "not_found" }, 404, origin, true);
    }
    if (!env.GEOAPIFY_API_KEY) return response({ error: "service_not_configured" }, 503, origin, true);

    let input: ReverseRequest;
    try {
      input = await request.json() as ReverseRequest;
    } catch {
      return response({ error: "invalid_json" }, 400, origin, true);
    }
    const latitude = input.latitude;
    const longitude = input.longitude;
    if (typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
        typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return response({ error: "invalid_coordinates" }, 400, origin, true);
    }

    const clientIp = request.headers.get("CF-Connecting-IP");
    if (!clientIp) return response({ error: "client_identity_unavailable" }, 400, origin, true);
    const rate = await env.RATE_LIMITER.limit({ key: clientIp });
    if (!rate.success) return response({ error: "rate_limited" }, 429, origin, true);

    const upstream = new URL("https://api.geoapify.com/v1/geocode/reverse");
    upstream.searchParams.set("lat", String(latitude));
    upstream.searchParams.set("lon", String(longitude));
    upstream.searchParams.set("format", "json");
    upstream.searchParams.set("lang", "en");
    upstream.searchParams.set("limit", "1");
    upstream.searchParams.set("apiKey", env.GEOAPIFY_API_KEY);

    try {
      const result = await fetch(upstream.toString(), { headers: { Accept: "application/json" } });
      if (!result.ok) return response({ error: "geocoding_unavailable" }, 502, origin, true);
      const payload = await result.json() as { features?: Array<{ properties?: Record<string, unknown> }> };
      const properties = payload.features?.[0]?.properties;
      const label = properties ? localityLabel(properties) : undefined;
      return response({ label: label ?? null }, 200, origin, true);
    } catch {
      return response({ error: "geocoding_unavailable" }, 502, origin, true);
    }
  },
};
