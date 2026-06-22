import { useStore, hexToRgb } from "../store";
import { totalSegments, gridWidth, gridDims, visualToLogical } from "../layout";

function hslHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Generate a design from a per-visual-cell color function, mapped to logical.
function buildDesign(fn: (vx: number, vy: number, w: number, h: number, selected: string) => string | null) {
  const { sections, rows, transpose, flipH, flipV, selected } = useStore.getState();
  const total = totalSegments(sections);
  const width = gridWidth(total, rows);
  const { w, h } = gridDims(width, rows, transpose);
  const colors: (string | null)[] = Array(total).fill(null);
  for (let vy = 0; vy < h; vy++) {
    for (let vx = 0; vx < w; vx++) {
      const logical = visualToLogical(vx, vy, width, rows, { transpose, flipH, flipV });
      if (logical >= total) continue;
      colors[logical] = fn(vx, vy, w, h, selected);
    }
  }
  useStore.getState().applyDesign(colors);
}

// Scale a hex color's brightness by t (0..1).
const dim = (hex: string, t: number) => {
  const [r, g, b] = hexToRgb(hex);
  return `#${[r, g, b].map((x) => Math.round(x * t).toString(16).padStart(2, "0")).join("")}`;
};

const PATTERNS: { label: string; fn: Parameters<typeof buildDesign>[0] }[] = [
  { label: "Rainbow →", fn: (vx, _vy, w) => hslHex(w > 1 ? vx / (w - 1) : 0, 1, 0.5) },
  { label: "Rainbow ↓", fn: (_vx, vy, _w, h) => hslHex(h > 1 ? vy / (h - 1) : 0, 1, 0.5) },
  { label: "Gradient →", fn: (vx, _vy, w, _h, sel) => dim(sel, w > 1 ? 1 - vx / (w - 1) : 1) },
  { label: "V-stripes", fn: (vx, _vy, _w, _h, sel) => (vx % 2 ? null : sel) },
  { label: "H-stripes", fn: (_vx, vy, _w, _h, sel) => (vy % 2 ? null : sel) },
  { label: "Checker", fn: (vx, vy, _w, _h, sel) => ((vx + vy) % 2 ? null : sel) },
];

export function Patterns() {
  return (
    <div className="toolbar">
      <div className="row">
        <strong>Patterns</strong>
        {PATTERNS.map((p) => (
          <button key={p.label} onClick={() => buildDesign(p.fn)}>
            {p.label}
          </button>
        ))}
        <span className="dim">gradient/stripes/checker use the selected color; rainbows are full-spectrum</span>
      </div>
    </div>
  );
}
