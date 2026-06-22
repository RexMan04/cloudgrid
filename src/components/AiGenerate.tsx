import { useState } from "react";
import { useStore } from "../store";
import { totalSegments, gridWidth, gridDims, visualToLogical } from "../layout";

// The Bun server (default :8787) holds the AI key and does the generation.
const SERVER = "http://localhost:8787";

export function AiGenerate() {
  const sections = useStore((s) => s.sections);
  const rows = useStore((s) => s.rows);
  const transpose = useStore((s) => s.transpose);
  const flipH = useStore((s) => s.flipH);
  const flipV = useStore((s) => s.flipV);
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const total = totalSegments(sections);
  const width = gridWidth(total, rows);
  const { w, h } = gridDims(width, rows, transpose);

  const generate = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setStatus("generating…");
    try {
      const res = await fetch(`${SERVER}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), width: w, height: h }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      const grid = data.grid as (string | null)[][];

      const colors: (string | null)[] = Array(total).fill(null);
      for (let vy = 0; vy < h; vy++) {
        for (let vx = 0; vx < w; vx++) {
          const logical = visualToLogical(vx, vy, width, rows, { transpose, flipH, flipV });
          if (logical >= total) continue;
          colors[logical] = grid?.[vy]?.[vx] ?? null;
        }
      }
      useStore.getState().applyDesign(colors);
      setStatus("done");
    } catch (e) {
      setStatus(`failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="toolbar">
      <div className="row">
        <strong>AI</strong>
        <input
          type="text"
          placeholder="describe a pattern (e.g. sunset, lightning, US flag)"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && generate()}
          style={{ width: 320 }}
        />
        <button className="primary" disabled={busy || !prompt.trim()} onClick={generate}>
          Generate
        </button>
        <span className="dim">{status}</span>
      </div>
      <div className="row dim">
        Generates a {w}×{h} pattern. Needs the Bun server running (<strong>bun run server</strong>) with
        ANTHROPIC_API_KEY or OPENAI_API_KEY set in .env. The key never reaches the browser.
      </div>
    </div>
  );
}
