import { useStore } from "../store";

// Physical-layout calibration controls (the painting surface is <Canvas/>).
export function Sections() {
  const sections = useStore((s) => s.sections);
  const rows = useStore((s) => s.rows);

  return (
    <div className="toolbar">
      <div className="row">
        <strong>Layout</strong>
        <label>rows (grid height)</label>
        <input
          type="number"
          min={1}
          max={45}
          value={rows}
          onChange={(e) => useStore.getState().setRows(Number(e.target.value))}
          style={{ width: 64 }}
        />
        <button onClick={() => useStore.getState().addSection()} disabled={sections.length >= 2}>
          + Add section
        </button>
        <span className="dim">
          one controller drives 2 sections (≤45 each). Reverse / Snake correct backwards or
          zigzag wiring so the grid maps right onto the install.
        </span>
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
