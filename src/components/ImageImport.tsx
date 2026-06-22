import { useRef } from "react";
import { useStore } from "../store";
import { totalSegments, gridWidth } from "../layout";

// Sample an image into the current grid (column-major) and push it.
async function importImage(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("could not load image"));
      img.src = url;
    });

    const { sections, rows } = useStore.getState();
    const total = totalSegments(sections);
    const width = gridWidth(total, rows);

    const cv = document.createElement("canvas");
    cv.width = width;
    cv.height = rows;
    const ctx = cv.getContext("2d")!;
    ctx.drawImage(img, 0, 0, width, rows); // stretch to grid
    const { data } = ctx.getImageData(0, 0, width, rows);

    const colors: (string | null)[] = Array(total).fill(null);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < width; col++) {
        const logical = col * rows + row;
        if (logical >= total) continue;
        const i = (row * width + col) * 4;
        const a = data[i + 3];
        if (a < 16) continue; // transparent -> off
        const hex = `#${[data[i], data[i + 1], data[i + 2]]
          .map((x) => x.toString(16).padStart(2, "0"))
          .join("")}`;
        colors[logical] = hex;
      }
    }
    useStore.getState().applyDesign(colors);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ImageImport() {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="toolbar">
      <div className="row">
        <strong>Image</strong>
        <button onClick={() => fileRef.current?.click()}>Import image → grid</button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importImage(f);
            e.target.value = "";
          }}
        />
        <span className="dim">stretches the image to your grid size, samples each cell, and pushes it</span>
      </div>
    </div>
  );
}
