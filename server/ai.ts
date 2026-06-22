// AI pattern generator. The API key stays here, server-side; the browser only
// sends a description and grid size and gets back a color grid. Supports
// Anthropic (Claude) or OpenAI, whichever key is set in .env.

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

function buildPrompt(desc: string, w: number, h: number): string {
  return (
    `You are designing a STATIC pixel pattern for an emissive RGB LED grid that is ` +
    `${w} columns wide and ${h} rows tall, origin top-left. Theme: "${desc}".\n\n` +
    `Rules:\n` +
    `- These are light-emitting LEDs: use BOLD, SATURATED colors. Avoid browns, grays, ` +
    `beiges, and near-white, they look washed out.\n` +
    `- Use null for pixels that should be off (dark).\n` +
    `- Make the pattern clearly readable at this low resolution.\n\n` +
    `Respond with ONLY a JSON array of exactly ${h} rows; each row is an array of exactly ` +
    `${w} items. Each item is a hex color string like "#ff2200" or null. No prose, no code fences.`
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
