// AI pattern generator. The API key stays here, server-side; the browser only
// sends a description and grid size and gets back a color grid. Supports
// Anthropic (Claude) or OpenAI, whichever key is set in .env.

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

function buildPrompt(desc: string, w: number, h: number): string {
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
    `COLOR (light-emitting LEDs):\n` +
    `- Use BOLD, SATURATED hex. Avoid browns, grays, beiges, near-white — they wash out. For "white" ` +
    `regions use pure #ffffff so they read as lit, not off.\n` +
    `- Use null only for cells that should be truly dark/off, as deliberate negative space.\n\n` +
    `WORKED EXAMPLE (a different subject and size — copy the technique, not the dimensions). ` +
    `A simple flag with a blue canton top-left and red/white stripes, on a 6-wide × 5-tall grid. ` +
    `Note the blue sits in rows 0-1 AND columns 0-2 (the top-left corner), and the stripes run the ` +
    `full width:\n` +
    `[\n` +
    `  ["#0a23a0","#0a23a0","#0a23a0","#e01020","#e01020","#e01020"],\n` +
    `  ["#0a23a0","#0a23a0","#0a23a0","#ffffff","#ffffff","#ffffff"],\n` +
    `  ["#e01020","#e01020","#e01020","#e01020","#e01020","#e01020"],\n` +
    `  ["#ffffff","#ffffff","#ffffff","#ffffff","#ffffff","#ffffff"],\n` +
    `  ["#e01020","#e01020","#e01020","#e01020","#e01020","#e01020"]\n` +
    `]\n\n` +
    `Now produce the ${w}×${h} image for "${desc}". Respond with ONLY a JSON array of exactly ${h} ` +
    `rows; each row is an array of exactly ${w} items. Each item is a hex string like "#ff2200" or ` +
    `null. No prose, no code fences.`
  );
}

function extractGrid(text: string, w: number, h: number): (string | null)[][] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end < 0) throw new Error("AI did not return a JSON grid");
  const arr = JSON.parse(text.slice(start, end + 1));
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

export async function generatePattern(desc: string, w: number, h: number): Promise<(string | null)[][]> {
  const prompt = buildPrompt(desc, w, h);
  let text = "";

  if (ANTHROPIC_KEY) {
    const model = process.env.GOVEE_AI_MODEL || "claude-sonnet-4-6";
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model, max_tokens: 4096, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    text = (data.content ?? []).map((c) => c.text ?? "").join("");
  } else if (OPENAI_KEY) {
    const model = process.env.GOVEE_AI_MODEL || "gpt-4o";
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    text = data.choices?.[0]?.message?.content ?? "";
  } else {
    throw new Error("No AI key set. Add ANTHROPIC_API_KEY or OPENAI_API_KEY to .env.");
  }

  return extractGrid(text, w, h);
}
