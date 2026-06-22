import { useRef, useState } from "react";
import { useStore } from "../store";
import { totalSegments, gridWidth, gridDims, visualToLogical } from "../layout";

type Fit = "stretch" | "contain" | "cover";

// Rotate an image source 90° onto a fresh canvas (swaps width/height).
function rotate90(img: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = h;
  c.height = w;
  const ctx = c.getContext("2d")!;
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  return c;
}

interface Adjust {
  sat: number;
  bright: number;
  contrast: number;
}

function sample(img: HTMLImageElement, fit: Fit, rotate: boolean, adj: Adjust) {
  const { sections, rows, transpose, flipH, flipV } = useStore.getState();
  const total = totalSegments(sections);
  const width = gridWidth(total, rows);
  const { w, h } = gridDims(width, rows, transpose); // display dimensions

  let src: CanvasImageSource = img;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;
  if (rotate) {
    src = rotate90(img, sw, sh);
    [sw, sh] = [sh, sw];
  }

  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d")!;
  // Punch up colors for LEDs (saturation/brightness/contrast) before sampling.
  ctx.filter = `saturate(${adj.sat}%) brightness(${adj.bright}%) contrast(${adj.contrast}%)`;
  if (fit === "stretch") {
    ctx.drawImage(src, 0, 0, w, h);
  } else {
    const scale = fit === "cover" ? Math.max(w / sw, h / sh) : Math.min(w / sw, h / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    ctx.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }

  const { data } = ctx.getImageData(0, 0, w, h);
  const colors: (string | null)[] = Array(total).fill(null);
  for (let vy = 0; vy < h; vy++) {
    for (let vx = 0; vx < w; vx++) {
      const logical = visualToLogical(vx, vy, width, rows, { transpose, flipH, flipV });
      if (logical >= total) continue;
      const i = (vy * w + vx) * 4;
      if (data[i + 3] < 16) continue; // transparent / letterbox -> off
      colors[logical] = `#${[data[i], data[i + 1], data[i + 2]]
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("")}`;
    }
  }
  useStore.getState().applyDesign(colors);
}

export function ImageImport() {
  const sections = useStore((s) => s.sections);
  const rows = useStore((s) => s.rows);
  const transpose = useStore((s) => s.transpose);
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [fit, setFit] = useState<Fit>("contain");
  const [rotate, setRotate] = useState(false);
  const [sat, setSat] = useState(100);
  const [bright, setBright] = useState(100);
  const [contrast, setContrast] = useState(100);

  const width = gridWidth(totalSegments(sections), rows);
  const { w, h } = gridDims(width, rows, transpose);
  const orient = w > h ? "landscape (wide)" : w < h ? "portrait (tall)" : "square";

  const resample = (over: Partial<{ f: Fit; r: boolean; sat: number; bright: number; contrast: number }> = {}) => {
    if (!imgRef.current) return;
    sample(imgRef.current, over.f ?? fit, over.r ?? rotate, {
      sat: over.sat ?? sat,
      bright: over.bright ?? bright,
      contrast: over.contrast ?? contrast,
    });
  };

  return (
    <div className="toolbar">
      <div className="row">
        <strong>Image</strong>
        <button onClick={() => fileRef.current?.click()}>Choose image</button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const url = URL.createObjectURL(f);
            const img = new Image();
            img.onload = () => {
              imgRef.current = img;
              resample();
              URL.revokeObjectURL(url);
            };
            img.src = url;
            e.target.value = "";
          }}
        />
        <span className="dim">samples to the grid and pushes it live</span>
      </div>

      <div className="row">
        <label>Fit</label>
        {(["contain", "cover", "stretch"] as Fit[]).map((f) => (
          <button
            key={f}
            className={fit === f ? "active" : ""}
            onClick={() => {
              setFit(f);
              resample({ f });
            }}
          >
            {f}
          </button>
        ))}
        <button
          className={rotate ? "active" : ""}
          onClick={() => {
            const r = !rotate;
            setRotate(r);
            resample({ r });
          }}
        >
          Rotate 90°
        </button>
      </div>

      <div className="row">
        <label>Saturation</label>
        <input type="range" min={0} max={300} value={sat}
          onChange={(e) => { const v = Number(e.target.value); setSat(v); resample({ sat: v }); }} />
        <span className="dim">{sat}%</span>
        <label>Brightness</label>
        <input type="range" min={0} max={200} value={bright}
          onChange={(e) => { const v = Number(e.target.value); setBright(v); resample({ bright: v }); }} />
        <span className="dim">{bright}%</span>
        <label>Contrast</label>
        <input type="range" min={0} max={300} value={contrast}
          onChange={(e) => { const v = Number(e.target.value); setContrast(v); resample({ contrast: v }); }} />
        <span className="dim">{contrast}%</span>
      </div>

      <div className="row dim">
        Grid is&nbsp;<strong>{w} × {h}</strong>&nbsp;cells ({orient}). Best with a {orient} image; any
        resolution works (downsampled). <em>contain</em> = whole image, <em>cover</em> = fill+crop,
        <em>&nbsp;stretch</em> = ignore aspect.
      </div>
    </div>
  );
}
