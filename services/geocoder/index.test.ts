import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "./src/index";
import type { GeoapifyProxyEnv } from "./src/index";

const ORIGIN = "https://app.example";
function environment(overrides: Partial<GeoapifyProxyEnv> = {}): GeoapifyProxyEnv {
  return {
    GEOAPIFY_API_KEY: "test-only-key",
    ALLOWED_ORIGINS: ORIGIN + ",https://localhost",
    RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
    ...overrides,
  };
}
function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://worker.example/reverse-geocode", {
    method: "POST",
    headers: { Origin: ORIGIN, "CF-Connecting-IP": "203.0.113.8", "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("Geoapify reverse-geocoding proxy", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("validates coordinates and returns only a locality label", async () => {
    const upstream = vi.fn(async (url: string) => {
      const parsed = new URL(url);
      expect(parsed.origin).toBe("https://api.geoapify.com");
      expect(parsed.pathname).toBe("/v1/geocode/reverse");
      expect(parsed.searchParams.get("lat")).toBe("19.076");
      expect(parsed.searchParams.get("lon")).toBe("72.8777");
      expect(parsed.searchParams.get("apiKey")).toBe("test-only-key");
      return new Response(JSON.stringify({ features: [{ properties: {
        suburb: "Andheri", city: "Mumbai", state: "Maharashtra", country: "India",
      } }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", upstream);
    const result = await worker.fetch(request({ latitude: 19.076, longitude: 72.8777 }), environment());
    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toEqual({ label: "Andheri, Mumbai, Maharashtra, India" });
    expect(result.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
  });

  it("rejects invalid coordinates before contacting Geoapify", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const result = await worker.fetch(request({ latitude: 91, longitude: 0 }), environment());
    expect(result.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("rejects unapproved origins", async () => {
    const result = await worker.fetch(request({ latitude: 1, longitude: 2 }, { Origin: "https://attacker.example" }), environment());
    expect(result.status).toBe(403);
  });

  it("enforces the per-IP rate limit", async () => {
    const result = await worker.fetch(request({ latitude: 1, longitude: 2 }), environment({
      RATE_LIMITER: { limit: vi.fn(async () => ({ success: false })) },
    }));
    expect(result.status).toBe(429);
  });

  it("does not disclose upstream errors or the API key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("secret-bearing upstream body", { status: 403 })));
    const result = await worker.fetch(request({ latitude: 1, longitude: 2 }), environment());
    expect(result.status).toBe(502);
    const body = await result.text();
    expect(body).not.toContain("test-only-key");
    expect(body).not.toContain("secret-bearing");
  });
});
