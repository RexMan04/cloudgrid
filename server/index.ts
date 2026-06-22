// CloudGrid backend proxy.
// Holds the Govee API key server-side and exposes a small JSON API to the
// browser. Bun auto-loads .env, so process.env.GOVEE_API_KEY is populated.

import { join } from "node:path";
import { listDevices, supportsSegmentColor, segmentCount, GoveeError } from "./govee.ts";
import { generatePattern } from "./ai.ts";

const PROBE_HTML = join(import.meta.dir, "..", "web", "probe.html");

const PORT = Number(process.env.PORT ?? 8787);

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      // Local dev convenience: the Vite frontend runs on a different port.
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function errorToResponse(err: unknown): Response {
  if (err instanceof GoveeError) {
    return json(
      {
        error: err.message,
        status: err.status,
        rateLimited: err.isRateLimit,
        retryAfter: err.retryAfter ?? null,
      },
      err.isRateLimit ? 429 : err.status,
    );
  }
  return json({ error: String(err), status: 500 }, 500);
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // CORS preflight for the Vite frontend (different port).
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // POST /api/generate — AI pattern generator. Body: {prompt,width,height}.
    if (url.pathname === "/api/generate" && req.method === "POST") {
      try {
        const body = (await req.json()) as { prompt?: string; width?: number; height?: number };
        const w = Math.max(1, Math.min(64, Number(body.width) || 8));
        const h = Math.max(1, Math.min(45, Number(body.height) || 11));
        const grid = await generatePattern(String(body.prompt ?? ""), w, h);
        return json({ grid });
      } catch (err) {
        return json({ error: String(err instanceof Error ? err.message : err) }, 500);
      }
    }

    // GET /api/devices — proxy the Govee device list, annotated with the one
    // fact the grid UI depends on: does each device expose segmentedColorRgb?
    if (url.pathname === "/api/devices" && req.method === "GET") {
      try {
        const devices = await listDevices();
        const annotated = devices.map((d) => ({
          sku: d.sku,
          deviceId: d.device,
          name: d.deviceName,
          type: d.type,
          supportsSegmentColor: supportsSegmentColor(d),
          segmentCount: segmentCount(d) ?? null,
          capabilities: d.capabilities,
        }));
        return json({ devices: annotated });
      } catch (err) {
        return errorToResponse(err);
      }
    }

    if (url.pathname === "/api/health") {
      return json({ ok: true });
    }

    // Serve the Web Bluetooth probe page. Web Bluetooth requires a secure
    // context; http://localhost qualifies, so open this from Chrome/Edge.
    if (url.pathname === "/" || url.pathname === "/probe") {
      const file = Bun.file(PROBE_HTML);
      if (await file.exists()) {
        return new Response(file, { headers: { "Content-Type": "text/html" } });
      }
      return json({ error: "probe.html not found" }, 404);
    }

    return json({ error: "Not found", path: url.pathname }, 404);
  },
});

console.log(`CloudGrid proxy listening on http://localhost:${server.port}`);
console.log(`  GET  /api/devices   list + flag segmentedColorRgb support`);
console.log(`  POST /api/generate  AI pattern generator (needs an AI key in .env)`);
console.log(`  GET  /api/health    liveness check`);
