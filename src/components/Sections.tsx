import { useStore } from "../store";
import { totalSegments, gridWidth, gridDims } from "../layout";

// Physical-layout calibration controls (the painting surface is <Canvas/>).
export function Sections() {
  const sections = useStore((s) => s.sections);
  const rows = useStore((s) => s.rows);
  const transpose = useStore((s) => s.transpose);
  const flipH = useStore((s) => s.flipH);
  const flipV = useStore((s) => s.flipV);

  const total = totalSegments(sections);
  const width = gridWidth(total, rows);
  const { w, h } = gridDims(width, rows, transpose);

  return (
    <div className="toolbar">
      <div className="row">
        <strong>Layout</strong>
        <label>run length (rows)</label>
        <input
          type="number"
          min={1}
          max={45}
          value={rows}
          onChange={(e) => useStore.getState().setRows(Number(e.target.value))}
          style={{ width: 64 }}
        />
        <label>orient</label>
        <button className={transpose ? "active" : ""} onClick={() => useStore.getState().toggleTranspose()}>
          Transpose
        </button>
        <button className={flipH ? "active" : ""} onClick={() => useStore.getState().toggleFlipH()}>
          Flip ↔
        </button>
        <button className={flipV ? "active" : ""} onClick={() => useStore.getState().toggleFlipV()}>
          Flip ↕
        </button>
        <button onClick={() => useStore.getState().addSection()} disabled={sections.length >= 2}>
          + Add section
        </button>
        <strong>&rarr; grid {w} × {h}</strong>
        <span className="dim">({total} segments)</span>
      </div>
      <div className="row dim">
        Calibrate orientation: paint the <strong>&nbsp;top-left&nbsp;</strong> cell, see which physical
        LED lights, then toggle Transpose / Flip ↔ / Flip ↕ until the on-screen top-left matches your
        back-left corner (top = back wall, left = left wall). “Run length” is the LEDs per snake run.
      </div>

      {sections.map((sec, si) => (
        <div className="row section-head" key={si}>
          <strong>Section {si + 1}</strong>
          <label>length</label>
          <input
            type="number"
            min={1}
            max={45}
            value={sec.length}
            onChange={(e) => useStore.getState().setSectionLength(si, Number(e.target.value))}
            style={{ width: 64 }}
          />
          <button
            className={sec.reversed ? "active" : ""}
            onClick={() => useStore.getState().toggleReverse(si)}
          >
            {sec.reversed ? "Reversed ⮌" : "Reverse"}
          </button>
          <button
            className={sec.serpentine ? "active" : ""}
            onClick={() => useStore.getState().toggleSerpentine(si)}
          >
            {sec.serpentine ? "Snake ⮌⮍" : "Snake"}
          </button>
          {sections.length > 1 && (
            <button onClick={() => useStore.getState().removeSection(si)}>Remove</button>
          )}
        </div>
      ))}
    </div>
  );
}
