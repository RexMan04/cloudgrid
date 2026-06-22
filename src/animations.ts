// Live animations. Each returns the color for a visual cell at a given frame.
// The engine (in the store) maps visual -> logical -> physical and streams
// frames over Bluetooth. Browser-driven, so it only runs while the page is open.

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

function dimHex(hex: string, t: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const c = (x: number) => Math.round(x * t).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

export interface AnimCtx {
  w: number;
  h: number;
  frame: number;
  selected: string;
  designAt: (vx: number, vy: number) => string | null; // current painted color at a cell
}

export interface Anim {
  id: string;
  label: string;
  fn: (vx: number, vy: number, c: AnimCtx) => string | null;
}

export const ANIMATIONS: Anim[] = [
  {
    id: "rainbow",
    label: "Rainbow flow",
    fn: (vx, _vy, c) => hslHex(((c.w > 1 ? vx / c.w : 0) + c.frame * 0.03) % 1, 1, 0.5),
  },
  {
    id: "cycle",
    label: "Color cycle",
    fn: (_vx, _vy, c) => hslHex((c.frame * 0.03) % 1, 1, 0.5),
  },
  {
    id: "chase",
    label: "Chase",
    fn: (vx, _vy, c) => (vx === c.frame % c.w ? c.selected : null),
  },
  {
    id: "sparkle",
    label: "Sparkle",
    fn: (vx, vy, c) => ((vx * 73 + vy * 131 + c.frame * 977) % 97 < 12 ? c.selected : null),
  },
  {
    id: "breathe",
    label: "Breathe design",
    fn: (vx, vy, c) => {
      const base = c.designAt(vx, vy);
      if (!base) return null;
      const t = (Math.sin(c.frame * 0.25) + 1) / 2;
      return dimHex(base, 0.15 + 0.85 * t);
    },
  },
  {
    id: "wave",
    label: "Wave",
    fn: (vx, vy, c) => {
      const base = c.designAt(vx, vy) ?? c.selected;
      const t = (Math.sin(c.frame * 0.3 - vx * 0.5) + 1) / 2;
      return dimHex(base, 0.1 + 0.9 * t);
    },
  },
];
