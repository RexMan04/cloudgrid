import { useEffect, useRef } from "react";
import { useStore } from "../store";

export function SegmentGrid() {
  const colors = useStore((s) => s.colors);
  const columns = useStore((s) => s.columns);
  const applyCell = useStore((s) => s.applyCell);
  const painting = useRef(false);

  // Stop drag-painting when the mouse is released anywhere.
  useEffect(() => {
    const up = () => (painting.current = false);
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);

  return (
    <div
      className="grid"
      style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
      onPointerLeave={() => (painting.current = false)}
    >
      {colors.map((c, i) => (
        <div
          key={i}
          className="cell"
          style={{ background: c ?? "#161616", borderColor: c ? "#000" : "#262626" }}
          title={`segment ${i}`}
          onPointerDown={(e) => {
            e.preventDefault();
            painting.current = true;
            applyCell(i);
          }}
          onPointerEnter={() => {
            if (painting.current) applyCell(i);
          }}
        >
          <span className="idx">{i}</span>
        </div>
      ))}
    </div>
  );
}
