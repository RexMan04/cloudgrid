// AI pattern generator. The API key stays here, server-side; the browser only
// sends a description and grid size and gets back a color grid. Supports
// Anthropic (Claude) or OpenAI, whichever key is set in .env.

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

function buildPrompt(desc: string, w: number, h: number, palette?: string[] | null): string {
  const hasPalette = Array.isArray(palette) && palette.length > 0;
  const colorSection = hasPalette
    ? `COLOR: you have a FIXED, pre-approved palette. Use ONLY these exact hex colors, nothing else:\n` +
      `${palette!.join(", ")}\n` +
      `- For every cell, pick the single closest color from that list. Do NOT invent in-between shades, ` +
      `do NOT desaturate, and do NOT output any hex that is not in the list above.\n` +
      `- These colors were chosen to render true on the actual LEDs, so trust them over "realism".\n` +
      `- Use null only for cells that should be truly dark/off, as deliberate negative space.\n\n`
    : `COLOR (these are glowing LEDs, not paint — use full-strength, vivid colors):\n` +
      `- Pure red is #ff0000, NOT a muted "realistic" #aa3a33 or #cc4444 — a desaturated red reads as ` +
      `pink/brown on the lights. Likewise green #00ff00, blue #0000ff (or a vivid #1030ff), yellow ` +
      `#ffff00, cyan #00ffff, white #ffffff.\n` +
      `- Pick the truest, most saturated version of each color. Avoid anything washed: no browns, grays, ` +
      `beiges, dusty or pastel shades, and no near-white.\n` +
      `- Do NOT pre-dim colors to make them "darker"; overall brightness is controlled separately by a ` +
      `hardware slider, so always output colors at full value.\n` +
      `- Use null only for cells that should be truly dark/off, as deliberate negative space.\n\n`;
  return (
    `You are a pixel artist composing a STATIC ${w}×${h} image for an emissive RGB LED grid. ` +
    `Subject: "${desc}".\n\n` +
    `COORDINATES (this is critical — get placement right):\n` +
    `- The grid is ${w} columns wide and ${h} rows tall.\n` +
    `- Row 0 is the TOP. Column 0 is the LEFT.\n` +
    `- So the top-left corner is row 0 / column 0; the bottom-right is the last row / last column.\n` +
    `- Anything described as "top-left" (like a flag's canton) belongs in the FIRST rows and the ` +
    `FIRST columns — never in the middle.\n\n` +
    `COMPOSITION:\n` +
    `- This canvas is tiny; plan the whole layout before choosing colors, then make it instantly ` +
    `recognizable. Fill the FULL grid edge to edge unless the subject is clearly a small object on a ` +
    `background.\n` +
    `- For a known subject (flag, logo, letter, symbol, face) reproduce its real layout faithfully: ` +
    `correct regions in the correct corners, stripe/segment counts scaled to fit, identifying ` +
    `features where they belong.\n` +
    `- Keep to a few strong colors so shapes stay legible. Don't dither or add noise.\n\n` +
    colorSection +
    `WORKED EXAMPLE (a different subject and size — copy the technique, not the dimensions). ` +
    `A simple flag with a blue canton top-left and red/white stripes, on a 6-wide × 5-tall grid. ` +
    `Note the blue sits in rows 0-1 AND columns 0-2 (the top-left corner), and the stripes run the ` +
    `full width:\n` +
    `[\n` +
    `  ["#0000ff","#0000ff","#0000ff","#ff0000","#ff0000","#ff0000"],\n` +
    `  ["#0000ff","#0000ff","#0000ff","#ffffff","#ffffff","#ffffff"],\n` +
    `  ["#ff0000","#ff0000","#ff0000","#ff0000","#ff0000","#ff0000"],\n` +
    `  ["#ffffff","#ffffff","#ffffff","#ffffff","#ffffff","#ffffff"],\n` +
    `  ["#ff0000","#ff0000","#ff0000","#ff0000","#ff0000","#ff0000"]\n` +
    `]\n\n` +
    `Now produce the ${w}×${h} image for "${desc}". Respond with ONLY a JSON array of exactly ${h} ` +
    `rows; each row is an array of exactly ${w} items. Each item is a hex string like "#ff2200" or ` +
    `null. No prose, no code fences.`
  );
}

// Reject a grid whose outer shape doesn't match what was asked for, rather than
// silently padding with null — a truncated/malformed response should surface as
// an error, not render as a blank-ish scene the user thinks succeeded. Extra
// trailing rows/cols are tolerated (we slice to w×h); short ones are not.
function assertGridShape(arr: unknown, w: number, h: number, label = "grid"): asserts arr is unknown[][] {
  if (!Array.isArray(arr) || arr.length < h) {
    throw new Error(`AI ${label} has ${Array.isArray(arr) ? arr.length : 0} rows, expected ${h}`);
  }
  for (let y = 0; y < h; y++) {
    if (!Array.isArray(arr[y]) || (arr[y] as unknown[]).length < w) {
      const got = Array.isArray(arr[y]) ? (arr[y] as unknown[]).length : 0;
      throw new Error(`AI ${label} row ${y} has ${got} cells, expected ${w}`);
    }
  }
}

function extractGrid(text: string, w: number, h: number): (string | null)[][] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end < 0) throw new Error("AI did not return a JSON grid");
  const arr = JSON.parse(text.slice(start, end + 1));
  assertGridShape(arr, w, h);
  const norm = (v: unknown): string | null => {
    if (typeof v !== "string") return null;
    const hex = v.startsWith("#") ? v.slice(1) : v;
    return /^[0-9a-fA-F]{6}$/.test(hex) ? `#${hex.toLowerCase()}` : null;
  };
  const grid: (string | null)[][] = [];
  for (let y = 0; y < h; y++) {
    const row: (string | null)[] = [];
    for (let x = 0; x < w; x++) row.push(norm(arr?.[y]?.[x]));
    grid.push(row);
  }
  return grid;
}

// Build the prompt for an animated (multi-frame) generation.
function buildAnimPrompt(desc: string, w: number, h: number, frames: number, palette?: string[] | null): string {
  const hasPalette = Array.isArray(palette) && palette.length > 0;
  const colorLine = hasPalette
    ? `Use ONLY these exact approved hex colors, nothing else: ${palette!.join(", ")}. For each cell pick the closest approved color.`
    : `Use full-strength, vivid colors (pure red #ff0000, green #00ff00, blue #0000ff, yellow #ffff00, etc.). Avoid washed/pastel shades. Do not pre-dim; overall brightness is a separate hardware control.`;
  return (
    `You are animating a ${w}×${h} looping animation for an emissive RGB LED grid.\n` +
    `Subject / motion: "${desc}".\n\n` +
    `COORDINATES: ${w} columns wide, ${h} rows tall. Row 0 is the TOP, column 0 is the LEFT.\n` +
    `ANIMATION: produce exactly ${frames} frames of a smooth LOOP (the last frame should flow back into the first). Move or change something meaningful between consecutive frames so the motion reads clearly on this low-resolution grid.\n` +
    `COLOR: ${colorLine}\n` +
    `Use null for cells that are off.\n\n` +
    `Respond with ONLY a JSON array of exactly ${frames} frames. Each frame is an array of exactly ${h} rows; each row is an array of exactly ${w} items (a hex string like "#ff2200" or null). No prose, no code fences.`
  );
}

function extractFrames(text: string, w: number, h: number): (string | null)[][][] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end < 0) throw new Error("AI did not return a JSON animation");
  const arr = JSON.parse(text.slice(start, end + 1));
  if (!Array.isArray(arr)) throw new Error("AI animation was not an array of frames");
  const norm = (v: unknown): string | null => {
    if (typeof v !== "string") return null;
    const hex = v.startsWith("#") ? v.slice(1) : v;
    return /^[0-9a-fA-F]{6}$/.test(hex) ? `#${hex.toLowerCase()}` : null;
  };
  const frames: (string | null)[][][] = [];
  for (const f of arr) {
    assertGridShape(f, w, h, "animation frame");
    const grid: (string | null)[][] = [];
    for (let y = 0; y < h; y++) {
      const row: (string | null)[] = [];
      for (let x = 0; x < w; x++) row.push(norm((f as never[])?.[y]?.[x]));
      grid.push(row);
    }
    frames.push(grid);
  }
  return frames;
}

// A full grid is ~one short hex token per cell plus JSON punctuation; budget
// generously so a large grid (or multi-frame animation) isn't truncated, but
// cap it so a pathological request can't ask for an enormous, slow response.
// The cap (16384) is the safe shared ceiling across the providers below.
function outputTokenBudget(w: number, h: number, frames = 1): number {
  return Math.min(16384, 700 + Math.ceil(w * h * frames * 9));
}

// One model call. Returns the raw text the model produced.
async function callModel(prompt: string, maxTokens: number): Promise<string> {
  if (ANTHROPIC_KEY) {
    // claude-sonnet-4-6 is an intentional pinned default: it's a fixed snapshot
    // (not an evergreen alias) chosen for cost/speed on this small-grid task.
    // Override with GOVEE_AI_MODEL (e.g. an Opus-tier id) for higher fidelity.
    const model = process.env.GOVEE_AI_MODEL || "claude-sonnet-4-6";
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    return (data.content ?? []).map((c) => c.text ?? "").join("");
  } else if (OPENAI_KEY) {
    // Fallback provider, used only when no Anthropic key is set. gpt-4o is a
    // known-working pinned default; override with GOVEE_AI_MODEL for a newer
    // OpenAI model. (Anthropic is the primary, better-tested path here.)
    const model = process.env.GOVEE_AI_MODEL || "gpt-4o";
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content ?? "";
  }
  throw new Error("No AI key set. Add ANTHROPIC_API_KEY or OPENAI_API_KEY to .env.");
}

export async function generatePattern(
  desc: string,
  w: number,
  h: number,
  palette?: string[] | null,
): Promise<(string | null)[][]> {
  const text = await callModel(buildPrompt(desc, w, h, palette), outputTokenBudget(w, h));
  return extractGrid(text, w, h);
}

export async function generateAnimation(
  desc: string,
  w: number,
  h: number,
  frames: number,
  palette?: string[] | null,
): Promise<(string | null)[][][]> {
  const n = Math.max(2, Math.min(16, Math.floor(frames) || 8));
  const text = await callModel(buildAnimPrompt(desc, w, h, n, palette), outputTokenBudget(w, h, n));
  return extractFrames(text, w, h);
}
