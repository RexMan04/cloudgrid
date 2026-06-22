// Govee Platform API v2 client.
// The API key is read here, server-side only, and never leaves this process.

const BASE_URL = "https://openapi.api.govee.com";

const SEGMENT_COLOR_TYPE = "devices.capabilities.segment_color_setting";
const SEGMENT_COLOR_INSTANCE = "segmentedColorRgb";

export interface GoveeCapability {
  type: string;
  instance: string;
  parameters?: unknown;
  // Some capabilities (like segment_color_setting) expose a fields[] with
  // segment count info. We keep it loose and inspect at the call site.
  [key: string]: unknown;
}

export interface GoveeDevice {
  sku: string;
  device: string; // the deviceId (MAC-like string)
  deviceName: string;
  type: string;
  capabilities: GoveeCapability[];
}

interface GoveeEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

/** Raised on a non-2xx Govee response or a code !== 200 envelope. */
export class GoveeError extends Error {
  readonly status: number;
  readonly isRateLimit: boolean;
  /** Seconds to wait before retrying, parsed from rate-limit headers if present. */
  readonly retryAfter?: number;

  constructor(
    message: string,
    opts: { status: number; isRateLimit?: boolean; retryAfter?: number },
  ) {
    super(message);
    this.name = "GoveeError";
    this.status = opts.status;
    this.isRateLimit = opts.isRateLimit ?? false;
    this.retryAfter = opts.retryAfter;
  }
}

function requireKey(): string {
  const key = process.env.GOVEE_API_KEY;
  if (!key || key === "your-key-here") {
    throw new GoveeError(
      "GOVEE_API_KEY is missing. Copy .env.example to .env and set your key.",
      { status: 500 },
    );
  }
  return key;
}

function parseRetryAfter(res: Response): number | undefined {
  // Govee uses standard rate headers plus its own. Try the common ones.
  const candidates = [
    res.headers.get("Retry-After"),
    res.headers.get("X-RateLimit-Reset"),
    res.headers.get("API-RateLimit-Reset"),
  ];
  for (const c of candidates) {
    if (c) {
      const n = Number(c);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return undefined;
}

async function request<T>(
  path: string,
  init: RequestInit & { method: "GET" | "POST" },
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Govee-API-Key": requireKey(),
      ...(init.headers ?? {}),
    },
  });

  if (res.status === 429) {
    throw new GoveeError("Govee API rate limit hit (429).", {
      status: 429,
      isRateLimit: true,
      retryAfter: parseRetryAfter(res),
    });
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GoveeError(
      `Govee API HTTP ${res.status}: ${body.slice(0, 300)}`,
      { status: res.status },
    );
  }

  const envelope = (await res.json()) as GoveeEnvelope<T>;
  if (envelope.code !== 200) {
    throw new GoveeError(
      `Govee API error code ${envelope.code}: ${envelope.message}`,
      { status: 502 },
    );
  }
  return envelope.data;
}

/** GET /router/api/v1/user/devices */
export async function listDevices(): Promise<GoveeDevice[]> {
  const data = await request<GoveeDevice[]>("/router/api/v1/user/devices", {
    method: "GET",
  });
  return data ?? [];
}

/** True if a device exposes per-segment RGB control (segmentedColorRgb). */
export function supportsSegmentColor(device: GoveeDevice): boolean {
  return device.capabilities.some(
    (c) => c.type === SEGMENT_COLOR_TYPE && c.instance === SEGMENT_COLOR_INSTANCE,
  );
}

/**
 * Extract the supported segment count for a device, if the capability advertises
 * it. Govee returns this under the segment_color_setting capability's fields.
 * Returns undefined if not discoverable from the device list payload.
 */
export function segmentCount(device: GoveeDevice): number | undefined {
  const cap = device.capabilities.find(
    (c) => c.type === SEGMENT_COLOR_TYPE && c.instance === SEGMENT_COLOR_INSTANCE,
  );
  if (!cap) return undefined;
  // Walk the loosely-typed parameters/fields looking for a segment options array.
  const params = cap.parameters as
    | { fields?: Array<{ fieldName?: string; size?: { max?: number }; options?: unknown[] }> }
    | undefined;
  const field = params?.fields?.find((f) => f.fieldName === "segment");
  return field?.size?.max;
}
