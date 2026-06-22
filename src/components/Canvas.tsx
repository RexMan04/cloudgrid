import { useEffect, useRef } from "react";
import { useStore } from "../store";
import { totalSegments, gridWidth, cellToLogical, sectionOfLogical } from "../layout";

export function Canvas() {
  const colors = useStore((s) => s.colors);
  const sections = useStore((s) => s.sections);
  const rows = useStore((s) => s.rows);
  const applyCell = useStore((s) => s.applyCell);
  const painting = useRef(false);

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

  const total = totalSegments(sections);
  const width = gridWidth(total, rows);

  const cells = [];
  for (let k = 0; k < width * rows; k++) {
    const vrow = Math.floor(k / width);
    const vcol = k % width;
    const logical = cellToLogical(vcol, vrow, rows); // column-major
    const exists = logical < total;
    const c = exists ? colors[logical] : null;
    const banded = exists && sectionOfLogical(logical, sections) % 2 === 1;
    cells.push(
      <div
        key={k}
        className={"cell" + (exists ? "" : " void") + (banded ? " band" : "")}
        style={{ background: exists ? c ?? "#161616" : "transparent", borderColor: c ? "#000" : "#262626" }}
        title={exists ? `col ${vcol}, row ${vrow}` : ""}
        onPointerDown={(e) => {
          if (!exists) return;
          e.preventDefault();
          painting.current = true;
          applyCell(logical);
        }}
        onPointerEnter={() => {
          if (exists && painting.current) applyCell(logical);
        }}
      />,
    );
  }

  return (
    <div
      className="canvas"
      style={{ gridTemplateColumns: `repeat(${width}, 1fr)` }}
      onPointerLeave={() => (painting.current = false)}
    >
      {cells}
    </div>
  );
}
