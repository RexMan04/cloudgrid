// CloudGrid server — one Bun process that serves the static frontend and the
// AI pattern generator. The AI key stays here, server-side; the browser only
// sends a prompt + grid size. Bun auto-loads .env.

import { join, normalize } from "node:path";
import { generatePattern } from "./ai.ts";

const WEB_DIR = join(import.meta.dir, "..", "web");
const PORT = Number(process.env.PORT ?? 8787);

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

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

    if (url.pathname === "/api/health") {
      return json({ ok: true });
    }

    // Static frontend. "/" serves the design-component page; everything else
    // maps to a file in web/. normalize() + the prefix check block path
    // traversal (e.g. /../server/ai.ts).
    const rel = url.pathname === "/" ? "CloudGrid.dc.html" : url.pathname.slice(1);
    const path = normalize(join(WEB_DIR, rel));
    if (path.startsWith(WEB_DIR)) {
      const file = Bun.file(path);
      if (await file.exists()) return new Response(file);
    }
    return json({ error: "Not found", path: url.pathname }, 404);
  },
});

console.log(`CloudGrid running on http://localhost:${server.port}`);
