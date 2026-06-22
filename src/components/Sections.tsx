import { useEffect, useRef } from "react";
import { useStore } from "../store";
import { sectionOffsets } from "../layout";

export function Sections() {
  const sections = useStore((s) => s.sections);
  const colors = useStore((s) => s.colors);
  const columns = useStore((s) => s.columns);
  const applyCell = useStore((s) => s.applyCell);
  const painting = useRef(false);

  // Push one scene when a paint gesture ends (anywhere).
  useEffect(() => {
    const up = () => {
      if (painting.current) {
        painting.current = false;
        void useStore.getState().push();
      }
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);

  const offsets = sectionOffsets(sections);

  return (
    <div className="sections">
      <div className="row">
        <strong>Sections</strong>
        <button onClick={() => useStore.getState().addSection()}>+ Add section</button>
        <span className="dim">
          one run per controller (cut to any length ≤45). Reverse a section if it's mounted backwards.
        </span>
      </div>

      {sections.map((sec, si) => (
        <div className="section" key={si}>
          <div className="row section-head">
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
            {sections.length > 1 && (
              <button onClick={() => useStore.getState().removeSection(si)}>Remove</button>
            )}
          </div>

          <div
            className="grid"
            style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
            onPointerLeave={() => (painting.current = false)}
          >
            {Array.from({ length: sec.length }, (_, lp) => {
              const gi = offsets[si] + lp; // global logical index
              const c = colors[gi];
              return (
                <div
                  key={lp}
                  className="cell"
                  style={{ background: c ?? "#161616", borderColor: c ? "#000" : "#262626" }}
                  title={`section ${si + 1}, position ${lp}`}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    painting.current = true;
                    applyCell(gi);
                  }}
                  onPointerEnter={() => {
                    if (painting.current) applyCell(gi);
                  }}
                >
                  <span className="idx">{lp}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
