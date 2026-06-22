import { useRef, useState } from "react";
import { useStore } from "../store";
import { totalSegments, gridWidth, gridDims } from "../layout";
import { sampleSource, type Fit } from "../sampler";

export function ImageImport() {
  const sections = useStore((s) => s.sections);
  const rows = useStore((s) => s.rows);
  const transpose = useStore((s) => s.transpose);
  const flipH = useStore((s) => s.flipH);
  const flipV = useStore((s) => s.flipV);
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
    const img = imgRef.current;
    if (!img) return;
    const colors = sampleSource(img, img.naturalWidth, img.naturalHeight, {
      sections,
      rows,
      transpose,
      flipH,
      flipV,
      fit: over.f ?? fit,
      rotate: over.r ?? rotate,
      adjust: { sat: over.sat ?? sat, bright: over.bright ?? bright, contrast: over.contrast ?? contrast },
    });
    useStore.getState().applyDesign(colors);
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
