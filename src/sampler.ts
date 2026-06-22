// Shared image/frame sampler: draw any image source into the grid (with fit,
// orientation, and color adjustments) and return a logical-indexed color array.
// Used by both single-image import and GIF/video frame playback.

import { totalSegments, gridWidth, gridDims, visualToLogical, type Section } from "./layout";

export type Fit = "stretch" | "contain" | "cover";

export interface SampleOpts {
  sections: Section[];
  rows: number;
  transpose: boolean;
  flipH: boolean;
  flipV: boolean;
  fit: Fit;
  rotate: boolean;
  adjust: { sat: number; bright: number; contrast: number };
}

function rotate90(src: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = h;
  c.height = w;
  const ctx = c.getContext("2d")!;
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(src, -w / 2, -h / 2, w, h);
  return c;
}

export function sampleSource(
  src: CanvasImageSource,
  sw: number,
  sh: number,
  o: SampleOpts,
): (string | null)[] {
  const total = totalSegments(o.sections);
  const width = gridWidth(total, o.rows);
  const { w, h } = gridDims(width, o.rows, o.transpose);

  let source = src;
  if (o.rotate) {
    source = rotate90(src, sw, sh);
    [sw, sh] = [sh, sw];
  }

  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d")!;
  ctx.filter = `saturate(${o.adjust.sat}%) brightness(${o.adjust.bright}%) contrast(${o.adjust.contrast}%)`;
  if (o.fit === "stretch") {
    ctx.drawImage(source, 0, 0, w, h);
  } else {
    const scale = o.fit === "cover" ? Math.max(w / sw, h / sh) : Math.min(w / sw, h / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    ctx.drawImage(source, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }

  const { data } = ctx.getImageData(0, 0, w, h);
  const colors: (string | null)[] = Array(total).fill(null);
  for (let vy = 0; vy < h; vy++) {
    for (let vx = 0; vx < w; vx++) {
      const logical = visualToLogical(vx, vy, width, o.rows, {
        transpose: o.transpose,
        flipH: o.flipH,
        flipV: o.flipV,
      });
      if (logical >= total) continue;
      const i = (vy * w + vx) * 4;
      if (data[i + 3] < 16) continue;
      colors[logical] = `#${[data[i], data[i + 1], data[i + 2]]
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("")}`;
    }
  }
  return colors;
}
