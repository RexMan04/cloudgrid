// Render the scene-preview generator to a filmstrip PNG so the approximation can
// be eyeballed without a browser. Mirrors CloudGrid.dc.html _sceneFrame. Lays the
// 88 logical segments out as the physical grid (8 cols x 11 rows) and draws each
// frame as a block of dots, several frames side by side.
//
// Run: bun tools/render-scene.ts <sceneLabelSubstring>   (default: Universe)
(globalThis as any).window = globalThis;
const core = await Bun.file(new URL("../web/cloudgrid-core.js", import.meta.url)).text();
(0, eval)(core);
const CG = (globalThis as any).CG;

const scenesText = await Bun.file(new URL("../web/captured-scenes.js", import.meta.url)).text();
const scenes = JSON.parse(scenesText.slice(scenesText.indexOf("["), scenesText.lastIndexOf("]") + 1));
const want = (process.argv[2] || "Universe").toLowerCase();
const scene = scenes.find((s: any) => s.label.toLowerCase().includes(want));
if (!scene) { console.error("no scene matching", want); process.exit(1); }
const meta = CG.decodeParametricScene(scene.pkts);

const hexToRgb = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
// mirror of _sceneFrame (master brightness = 1)
function sceneFrame(f: number, total: number): (number[] | null)[] {
  const pal = meta.palette.map((rgb: number[]) => rgb);
  const speedF = Math.max(0.3, (meta.speed || 32) / 32);
  const bgMax = Math.max(meta.bg[0], meta.bg[1], meta.bg[2]);
  const bg = bgMax > 8 ? meta.bg : null;
  const out: (number[] | null)[] = new Array(total).fill(bg);
  if (meta.type === 1) {
    const stops = pal.length;
    const phase = (f * 0.012 * speedF) % 1;
    for (let p = 0; p < total; p++) {
      const x = (((p / total) + phase) % 1) * stops;
      const i = Math.floor(x) % stops, j = (i + 1) % stops, t = x - Math.floor(x);
      out[p] = pal[i].map((c: number, k: number) => Math.round(c + (pal[j][k] - c) * t));
    }
  } else {
    const len = pal.length;
    const drift = f * 0.06 * speedF;
    for (let p = 0; p < total; p++) {
      const ci = (((Math.floor(p + drift)) % len) + len) % len;
      const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(p * 0.7 + f * 0.18 * speedF));
      out[p] = pal[ci].map((c: number) => Math.round(c * tw));
    }
  }
  const half = Math.floor(total / 2); // mirror across the 2 strands
  if (half > 0) for (let p = half; p < total; p++) out[p] = out[p - half];
  return out;
}

// layout: 8 cols x 11 rows; logical p -> col=floor(p/11), row=p%11
const ROWS = 11, COLS = 8, TOTAL = ROWS * COLS;
const DOT = 26, GAP = 8, PAD = 14, FGAP = 26;
const gridW = COLS * DOT + (COLS - 1) * GAP;
const gridH = ROWS * DOT + (ROWS - 1) * GAP;
const frames = [0, 8, 16, 24, 32, 40];
const W = PAD * 2 + frames.length * gridW + (frames.length - 1) * FGAP;
const H = PAD * 2 + gridH;
const buf = new Uint8Array(W * H * 3);
// dark backdrop
for (let i = 0; i < W * H; i++) { buf[i * 3] = 12; buf[i * 3 + 1] = 14; buf[i * 3 + 2] = 18; }
const px = (x: number, y: number, rgb: number[]) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const o = (y * W + x) * 3; buf[o] = rgb[0]; buf[o + 1] = rgb[1]; buf[o + 2] = rgb[2];
};
frames.forEach((f, fi) => {
  const colors = sceneFrame(f, TOTAL);
  const ox = PAD + fi * (gridW + FGAP);
  for (let p = 0; p < TOTAL; p++) {
    const col = Math.floor(p / ROWS), row = p % ROWS;
    const cx = ox + col * (DOT + GAP), cy = PAD + row * (DOT + GAP);
    const rgb = colors[p] || [20, 22, 28];
    const r = DOT / 2;
    for (let dy = 0; dy < DOT; dy++) for (let dx = 0; dx < DOT; dx++) {
      const ddx = dx - r + 0.5, ddy = dy - r + 0.5;
      if (ddx * ddx + ddy * ddy <= r * r) px(ox + col * (DOT + GAP) + dx, cy + dy, rgb);
    }
    void cx;
  }
});

const ppm = `P6\n${W} ${H}\n255\n`;
const out = new Uint8Array(ppm.length + buf.length);
out.set([...ppm].map((c) => c.charCodeAt(0)), 0);
out.set(buf, ppm.length);
const tmp = (process.env.TMPDIR || "/tmp") + "/cloudgrid-scene.ppm";
await Bun.write(tmp, out);
console.log(`wrote ${W}x${H} filmstrip for "${scene.label}" (type=${meta.type} speed=${meta.speed} palette=${meta.palette.map((r:number[])=>"#"+r.map(x=>x.toString(16).padStart(2,"0")).join("")).join(",")})`);
console.log("ppm:", tmp);
